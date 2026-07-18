-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'LECTURER', 'STUDENT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_BLANK', 'DESCRIPTIVE');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ResultPolicy" AS ENUM ('IMMEDIATE', 'AFTER_COMPLETION', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "AudienceTargetType" AS ENUM ('ALL_LECTURERS', 'ALL_STUDENTS', 'USER', 'CLASS');

-- CreateEnum
CREATE TYPE "PollResultVisibility" AS ENUM ('AFTER_VOTE', 'AFTER_EXPIRY');

-- CreateEnum
CREATE TYPE "AiEvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "family" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_token_id" UUID,
    "created_by_ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_lecturers" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "lecturer_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "class_lecturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_students" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "class_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "lecturer_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "lecturer_id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "explanation" TEXT,
    "default_marks" DECIMAL(8,2) NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL,
    "subject" VARCHAR(150),
    "topic" VARCHAR(150),
    "correct_text" TEXT,
    "image_url" TEXT,
    "image_blob_key" VARCHAR(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_tags" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "lecturer_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "result_policy" "ResultPolicy" NOT NULL,
    "result_declare_at" TIMESTAMPTZ,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_questions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "marks" DECIMAL(8,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assignment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "score" DECIMAL(10,2),
    "max_score" DECIMAL(10,2),
    "correct_count" INTEGER,
    "incorrect_count" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_answers" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_question_id" UUID NOT NULL,
    "answer" JSONB,
    "is_correct" BOOLEAN,
    "marks_awarded" DECIMAL(8,2),
    "graded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circulars" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "cover_image_blob_key" VARCHAR(512),
    "publish_at" TIMESTAMPTZ NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "updated_by" UUID,

    CONSTRAINT "circulars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circular_audiences" (
    "id" UUID NOT NULL,
    "circular_id" UUID NOT NULL,
    "target_type" "AudienceTargetType" NOT NULL,
    "target_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circular_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "publish_at" TIMESTAMPTZ NOT NULL,
    "expire_at" TIMESTAMPTZ NOT NULL,
    "result_visibility" "PollResultVisibility" NOT NULL DEFAULT 'AFTER_VOTE',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "updated_by" UUID,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "option_text" VARCHAR(500) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_audiences" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "target_type" "AudienceTargetType" NOT NULL,
    "target_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_evaluations" (
    "id" UUID NOT NULL,
    "submission_answer_id" UUID NOT NULL,
    "status" "AiEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "similarity_percent" DECIMAL(5,2),
    "marks_awarded" DECIMAL(8,2),
    "suggested_corrections" TEXT,
    "feedback" TEXT,
    "model_name" VARCHAR(100),
    "raw_response" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_role_active" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_expires" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_login_attempts_email_created" ON "login_attempts"("email", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_login_attempts_ip_created" ON "login_attempts"("ip_address", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_classes_active" ON "classes"("is_active");

-- CreateIndex
CREATE INDEX "idx_class_lecturers_lecturer_id" ON "class_lecturers"("lecturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_lecturers_class_lecturer" ON "class_lecturers"("class_id", "lecturer_id");

-- CreateIndex
CREATE INDEX "idx_class_students_student_id" ON "class_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_students_class_student" ON "class_students"("class_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_tags_lecturer_id" ON "tags"("lecturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "uidx_tags_lecturer_name" ON "tags"("lecturer_id", "name");

-- CreateIndex
CREATE INDEX "idx_questions_lecturer_created" ON "questions"("lecturer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_questions_lecturer_subject" ON "questions"("lecturer_id", "subject");

-- CreateIndex
CREATE INDEX "idx_questions_lecturer_topic" ON "questions"("lecturer_id", "topic");

-- CreateIndex
CREATE INDEX "idx_questions_lecturer_difficulty" ON "questions"("lecturer_id", "difficulty");

-- CreateIndex
CREATE INDEX "idx_questions_lecturer_type" ON "questions"("lecturer_id", "type");

-- CreateIndex
CREATE INDEX "idx_question_options_question_id" ON "question_options"("question_id");

-- CreateIndex
CREATE INDEX "idx_question_tags_tag_id" ON "question_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "uidx_question_tags_pair" ON "question_tags"("question_id", "tag_id");

-- CreateIndex
CREATE INDEX "idx_assignments_class_start" ON "assignments"("class_id", "start_at" DESC);

-- CreateIndex
CREATE INDEX "idx_assignments_lecturer_created" ON "assignments"("lecturer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_assignments_window" ON "assignments"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "idx_assignment_questions_assignment_sort" ON "assignment_questions"("assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_assignment_questions_question_id" ON "assignment_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "uidx_assignment_questions_pair" ON "assignment_questions"("assignment_id", "question_id");

-- CreateIndex
CREATE INDEX "idx_submissions_student_started" ON "submissions"("student_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_submissions_assignment_status" ON "submissions"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "idx_submissions_autosubmit" ON "submissions"("ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_submissions_assignment_student" ON "submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_submission_answers_aq_id" ON "submission_answers"("assignment_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "uidx_submission_answers_pair" ON "submission_answers"("submission_id", "assignment_question_id");

-- CreateIndex
CREATE INDEX "idx_circulars_publish" ON "circulars"("publish_at" DESC);

-- CreateIndex
CREATE INDEX "idx_circulars_author" ON "circulars"("created_by_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_circulars_scheduled" ON "circulars"("publish_at");

-- CreateIndex
CREATE INDEX "idx_circular_audiences_circular" ON "circular_audiences"("circular_id");

-- CreateIndex
CREATE INDEX "idx_circular_audiences_target" ON "circular_audiences"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_polls_active" ON "polls"("publish_at", "expire_at");

-- CreateIndex
CREATE INDEX "idx_polls_scheduled" ON "polls"("publish_at");

-- CreateIndex
CREATE INDEX "idx_polls_author" ON "polls"("created_by_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_poll_options_poll_sort" ON "poll_options"("poll_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_poll_audiences_poll" ON "poll_audiences"("poll_id");

-- CreateIndex
CREATE INDEX "idx_poll_audiences_target" ON "poll_audiences"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_option_id" ON "poll_votes"("option_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_poll_id" ON "poll_votes"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "uidx_poll_votes_poll_user" ON "poll_votes"("poll_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_evaluations_submission_answer_id_key" ON "ai_evaluations"("submission_answer_id");

-- CreateIndex
CREATE INDEX "idx_ai_evaluations_status" ON "ai_evaluations"("status", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_assignment_question_id_fkey" FOREIGN KEY ("assignment_question_id") REFERENCES "assignment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circular_audiences" ADD CONSTRAINT "circular_audiences_circular_id_fkey" FOREIGN KEY ("circular_id") REFERENCES "circulars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_audiences" ADD CONSTRAINT "poll_audiences_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_submission_answer_id_fkey" FOREIGN KEY ("submission_answer_id") REFERENCES "submission_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

