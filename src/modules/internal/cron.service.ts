import { autoSubmitExpired } from '../assignments/assignments.service';
import { publishScheduledCirculars } from '../circulars/circulars.service';
import { publishScheduledPolls } from '../polls/polls.service';

export async function runAutoSubmit() {
  return autoSubmitExpired();
}

export async function runPublishScheduled() {
  const circulars = await publishScheduledCirculars();
  const polls = await publishScheduledPolls();
  return { circulars, polls };
}
