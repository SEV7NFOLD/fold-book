"use strict";

// Sends FoldBook emails (host sign-in codes and invites) through a Gmail account with an
// app password, which is free (about 500 emails a day). Set in Vercel:
//   SMTP_USER  the Gmail address, e.g. sev7nfold@gmail.com
//   SMTP_PASS  a 16-character Gmail app password (Google Account → Security → App passwords)
// Optional: SMTP_HOST / SMTP_PORT for another provider, SMTP_FROM_NAME for the sender name.

function emailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    const error = new Error("Email isn’t set up yet. Add SMTP_USER and SMTP_PASS in Vercel.");
    error.status = 503;
    throw error;
  }
  const fromName = process.env.SMTP_FROM_NAME || "FoldBook by SEV7N FOLD";
  await getTransporter().sendMail({ from: `"${fromName}" <${process.env.SMTP_USER}>`, to, subject, text, html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

// A plain, readable email: a heading, a few lines and an optional big code or button.
function emailLayout({ heading, lines, code, button }) {
  const body = lines.map((line) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#2b2b33">${escapeHtml(line)}</p>`).join("");
  const codeBlock = code ? `<p style="margin:8px 0 22px;font-size:34px;font-weight:800;letter-spacing:8px;color:#111">${escapeHtml(code)}</p>` : "";
  const buttonBlock = button ? `<p style="margin:8px 0 22px"><a href="${escapeHtml(button.href)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#d9f07c;color:#111;font-weight:700;text-decoration:none">${escapeHtml(button.label)}</a></p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
<p style="margin:0 0 18px;font-size:14px;font-weight:700;letter-spacing:2px;color:#6b6578">FOLDBOOK</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#111">${escapeHtml(heading)}</h1>${body}${codeBlock}${buttonBlock}
<p style="margin:24px 0 0;font-size:13px;color:#8a8494">FoldBook is built by SEV7N FOLD.</p></div>`;
}

module.exports = { emailConfigured, sendEmail, emailLayout };
