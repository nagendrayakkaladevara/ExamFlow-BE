import type { PollResultVisibility, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { getLecturerClassIds, isAudienceVisible } from '../../utils/audience';
import type { createPollSchema, updatePollSchema, voteSchema } from './polls.schema';
import type { z } from 'zod';

type PollTag = 'active' | 'expired' | 'participated';

function buildPollTags(
  poll: { publishAt: Date; expireAt: Date; isPublished: boolean },
  hasVoted: boolean,
  now = new Date(),
): PollTag[] {
  const tags: PollTag[] = [];
  const isLive = poll.isPublished && poll.publishAt <= now;
  const isExpired = poll.expireAt <= now;
  const isActive = isLive && !isExpired;

  if (hasVoted) {
    tags.push('participated');
  } else if (isActive) {
    tags.push('active');
  }

  if (isExpired) {
    tags.push('expired');
  }

  return tags;
}

function validateAudiences(
  role: UserRole,
  audiences: { targetType: string; targetId?: string }[],
) {
  for (const row of audiences) {
    if (['USER', 'CLASS'].includes(row.targetType) && !row.targetId) {
      throw ApiError.badRequest('targetId required for USER/CLASS audience', 'INVALID_AUDIENCE');
    }
    if (role === 'LECTURER' && ['ALL_LECTURERS', 'ALL_STUDENTS'].includes(row.targetType)) {
      throw ApiError.forbidden('Lecturers cannot use institution-wide audiences', 'INVALID_AUDIENCE');
    }
  }
}

function mapPoll(
  row: {
    id: string;
    title: string;
    description: string | null;
    publishAt: Date;
    expireAt: Date;
    resultVisibility: PollResultVisibility;
    isPublished: boolean;
    createdAt: Date;
    options?: { id: string; optionText: string; sortOrder: number }[];
    audiences?: { targetType: string; targetId: string | null }[];
  },
  tags: PollTag[] = [],
) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    publishAt: row.publishAt,
    expireAt: row.expireAt,
    resultVisibility: row.resultVisibility,
    isPublished: row.isPublished,
    createdAt: row.createdAt,
    tags,
    options: row.options?.map((o) => ({
      id: o.id,
      optionText: o.optionText,
      sortOrder: o.sortOrder,
    })),
    audiences: row.audiences?.map((a) => ({
      targetType: a.targetType,
      targetId: a.targetId,
    })),
  };
}

async function getUserVotedPollIds(userId: string, pollIds: string[]) {
  if (pollIds.length === 0) return new Set<string>();

  const votes = await prisma.pollVote.findMany({
    where: { userId, pollId: { in: pollIds } },
    select: { pollId: true },
  });

  return new Set(votes.map((vote) => vote.pollId));
}

/** Flip scheduled items live when publishAt has passed (replaces Vercel Cron on free tier). */
async function ensurePollPublished(row: { id: string; isPublished: boolean; publishAt: Date }) {
  if (!row.isPublished && row.publishAt <= new Date()) {
    await prisma.poll.update({ where: { id: row.id }, data: { isPublished: true } });
    row.isPublished = true;
  }
}

export async function listPolls(user: { id: string; role: UserRole }, limit = 20) {
  const now = new Date();

  if (user.role === 'ADMIN') {
    const rows = await prisma.poll.findMany({
      where: { deletedAt: null },
      include: { options: { orderBy: { sortOrder: 'asc' } }, audiences: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const votedPollIds = await getUserVotedPollIds(
      user.id,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      mapPoll(row, buildPollTags(row, votedPollIds.has(row.id), now)),
    );
  }

  await publishScheduledPolls();

  const rows = await prisma.poll.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      publishAt: { lte: now },
    },
    include: { options: { orderBy: { sortOrder: 'asc' } }, audiences: true },
    orderBy: [{ expireAt: 'desc' }, { publishAt: 'desc' }],
  });

  const visible = [];
  for (const row of rows) {
    if (
      await isAudienceVisible(
        row.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
        { userId: user.id, role: user.role },
      )
    ) {
      visible.push(row);
    }
  }

  const limited = visible.slice(0, limit);
  const votedPollIds = await getUserVotedPollIds(
    user.id,
    limited.map((row) => row.id),
  );

  return limited.map((row) =>
    mapPoll(row, buildPollTags(row, votedPollIds.has(row.id), now)),
  );
}

export async function getPoll(id: string, user: { id: string; role: UserRole }) {
  const row = await prisma.poll.findFirst({
    where: { id, deletedAt: null },
    include: { options: { orderBy: { sortOrder: 'asc' } }, audiences: true },
  });
  if (!row) throw ApiError.notFound('Poll not found');

  if (user.role !== 'ADMIN') {
    await ensurePollPublished(row);
    if (!row.isPublished || row.publishAt > new Date()) {
      throw ApiError.notFound('Poll not found');
    }
    const visible = await isAudienceVisible(
      row.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
      { userId: user.id, role: user.role },
    );
    if (!visible) throw ApiError.notFound('Poll not found');
  }

  const vote = await prisma.pollVote.findUnique({
    where: { pollId_userId: { pollId: id, userId: user.id } },
    select: { pollId: true },
  });

  return mapPoll(row, buildPollTags(row, !!vote));
}

export async function createPoll(
  user: { id: string; role: UserRole },
  input: z.infer<typeof createPollSchema>,
) {
  validateAudiences(user.role, input.audiences);

  if (user.role === 'LECTURER') {
    const classIds = await getLecturerClassIds(user.id);
    for (const aud of input.audiences) {
      if (aud.targetType === 'CLASS' && aud.targetId && !classIds.includes(aud.targetId)) {
        throw ApiError.forbidden('Cannot target class you do not teach', 'INVALID_AUDIENCE');
      }
    }
  }

  const publishAt = new Date(input.publishAt);
  const row = await prisma.poll.create({
    data: {
      createdById: user.id,
      title: input.title,
      description: input.description,
      publishAt,
      expireAt: new Date(input.expireAt),
      resultVisibility: input.resultVisibility,
      isPublished: publishAt <= new Date(),
      options: { create: input.options },
      audiences: { create: input.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })) },
    },
    include: { options: true, audiences: true },
  });
  return mapPoll(row);
}

export async function updatePoll(
  user: { id: string; role: UserRole },
  id: string,
  input: z.infer<typeof updatePollSchema>,
) {
  const existing = await prisma.poll.findFirst({
    where: { id, deletedAt: null, ...(user.role === 'LECTURER' ? { createdById: user.id } : {}) },
  });
  if (!existing) throw ApiError.notFound('Poll not found');
  if (input.audiences) validateAudiences(user.role, input.audiences);

  await prisma.$transaction(async (tx) => {
    if (input.options) {
      await tx.pollOption.deleteMany({ where: { pollId: id } });
    }
    if (input.audiences) {
      await tx.pollAudience.deleteMany({ where: { pollId: id } });
    }
    await tx.poll.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.publishAt
          ? {
              publishAt: new Date(input.publishAt),
              isPublished: new Date(input.publishAt) <= new Date(),
            }
          : {}),
        ...(input.expireAt ? { expireAt: new Date(input.expireAt) } : {}),
        ...(input.resultVisibility ? { resultVisibility: input.resultVisibility } : {}),
        updatedById: user.id,
        ...(input.options ? { options: { create: input.options } } : {}),
        ...(input.audiences
          ? {
              audiences: {
                create: input.audiences.map((a) => ({
                  targetType: a.targetType,
                  targetId: a.targetId,
                })),
              },
            }
          : {}),
      },
    });
  });

  return getPoll(id, user);
}

export async function deletePoll(user: { id: string; role: UserRole }, id: string) {
  const existing = await prisma.poll.findFirst({
    where: { id, deletedAt: null, ...(user.role === 'LECTURER' ? { createdById: user.id } : {}) },
  });
  if (!existing) throw ApiError.notFound('Poll not found');
  await prisma.poll.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: user.id },
  });
}

export async function vote(
  user: { id: string; role: UserRole },
  pollId: string,
  input: z.infer<typeof voteSchema>,
) {
  const poll = await prisma.poll.findFirst({
    where: { id: pollId, deletedAt: null },
    include: { audiences: true, options: true },
  });
  if (!poll) throw ApiError.notFound('Poll not found');

  await ensurePollPublished(poll);

  const now = new Date();
  if (!poll.isPublished || poll.publishAt > now || poll.expireAt <= now) {
    throw ApiError.forbidden('Poll is not active', 'POLL_NOT_ACTIVE');
  }

  const visible = await isAudienceVisible(
    poll.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
    { userId: user.id, role: user.role },
  );
  if (!visible) throw ApiError.forbidden('Poll not available', 'POLL_NOT_AVAILABLE');

  const option = poll.options.find((o) => o.id === input.optionId);
  if (!option) throw ApiError.badRequest('Invalid option', 'INVALID_OPTION');

  try {
    await prisma.pollVote.create({
      data: { pollId, optionId: input.optionId, userId: user.id },
    });
  } catch {
    throw ApiError.conflict('Already voted', 'ALREADY_VOTED');
  }

  return { voted: true };
}

export async function getResults(pollId: string, user: { id: string; role: UserRole }) {
  const poll = await prisma.poll.findFirst({
    where: { id: pollId, deletedAt: null },
    include: { options: true, audiences: true, votes: true },
  });
  if (!poll) throw ApiError.notFound('Poll not found');

  const now = new Date();
  const userVote = poll.votes.find((v) => v.userId === user.id);

  let canView = user.role === 'ADMIN';
  if (!canView) {
    switch (poll.resultVisibility) {
      case 'AFTER_VOTE':
        canView = !!userVote;
        break;
      case 'AFTER_EXPIRY':
        canView = now >= poll.expireAt;
        break;
      case 'NEVER':
        canView = false;
        break;
    }
  }

  if (!canView) {
    throw ApiError.forbidden('Results not available', 'RESULTS_NOT_AVAILABLE');
  }

  const counts = poll.options.map((o) => ({
    optionId: o.id,
    optionText: o.optionText,
    votes: poll.votes.filter((v) => v.optionId === o.id).length,
  }));

  return { pollId, totalVotes: poll.votes.length, options: counts };
}

export async function publishScheduledPolls() {
  const now = new Date();
  const result = await prisma.poll.updateMany({
    where: {
      deletedAt: null,
      isPublished: false,
      publishAt: { lte: now },
    },
    data: { isPublished: true },
  });
  return { published: result.count };
}
