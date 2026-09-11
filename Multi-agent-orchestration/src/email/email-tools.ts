import { EmailDraft } from "./email-type";
import nodemailer from "nodemailer";
import * as fs from "fs";
import * as path from "path";

const DRAFT_FILE = path.join(import.meta.dirname, ".drafts.json");

type DraftStore = Record<string, EmailDraft>;

function loadDrafts(): DraftStore {
  if (!fs.existsSync(DRAFT_FILE)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(DRAFT_FILE, "utf8").trim();
    return raw ? (JSON.parse(raw) as DraftStore) : {};
  } catch {
    return {};
  }
}

function saveDrafts(drafts: DraftStore): void {
  fs.writeFileSync(DRAFT_FILE, JSON.stringify(drafts, null, 2), "utf8");
}

export function savePendingEmailDraft(
  userId: string,
  draft: EmailDraft
): void {
  const drafts = loadDrafts();
  drafts[userId] = draft;
  saveDrafts(drafts);
}

export function getPendingEmailDraft(
  userId: string
): EmailDraft | undefined {
  return loadDrafts()[userId];
}

export function deletePendingEmailDraft(userId: string): void {
  const drafts = loadDrafts();

  if (!(userId in drafts)) {
    return;
  }

  delete drafts[userId];
  saveDrafts(drafts);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string): string {
  return escapeHtml(body).replace(/\r?\n/g, "<br>");
}

export function createEmailDraft(
  to: string,
  subject: string,
  body: string
): EmailDraft {
  return {
    to,
    subject,
    body,
    status: "pending_approval",
  };
}

export function approveEmailDraft(
  draft: EmailDraft
): EmailDraft {
  if (draft.status !== "pending_approval") {
    throw new Error("Only pending email drafts can be approved.");
  }

  return {
    ...draft,
    status: "approved",
  };
}

export async function sendApprovedEmail(
  draft: EmailDraft
): Promise<EmailDraft> {
  if (draft.status !== "approved") {
    throw new Error(
      "Email cannot be sent without explicit user approval."
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    html: bodyToHtml(draft.body),
  });

  return {
    ...draft,
    status: "sent",
  };
}

export function cancelEmailDraft(
  draft: EmailDraft
): EmailDraft {
  if (draft.status !== "pending_approval") {
    throw new Error("Only pending email drafts can be cancelled.");
  }

  return {
    ...draft,
    status: "cancelled",
  };
}