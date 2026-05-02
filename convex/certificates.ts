import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const listTemplates = query({
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("certificateTemplates").collect();
  },
});

export const getIssuedCertificates = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "certificates.issue");
    return await ctx.db.query("issuedCertificates").collect();
  },
});

export const getStudentCertificates = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    const certs = await ctx.db
      .query("issuedCertificates")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();

    // Enrich with template info
    const result = [];
    for (const cert of certs) {
      const template = await ctx.db.get(cert.templateId);
      result.push({
        ...cert,
        templateName: template?.name ?? "Unknown",
      });
    }
    return result;
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const createTemplate = mutation({
  args: {
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "certificates.issue");
    return await ctx.db.insert("certificateTemplates", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const deleteTemplate = mutation({
  args: { id: v.id("certificateTemplates") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "certificates.issue");
    const template = await ctx.db.get(id);
    if (template?.fileId) {
      await ctx.storage.delete(template.fileId);
    }
    // Delete issued certificates for this template
    const issued = await ctx.db
      .query("issuedCertificates")
      .withIndex("by_templateId", (q) => q.eq("templateId", id))
      .collect();
    for (const cert of issued) {
      await ctx.db.delete(cert._id);
    }
    await ctx.db.delete(id);
  },
});

/** Generate an upload URL for the certificate PDF. */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requirePermission(ctx, "certificates.issue");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Attach an uploaded file to a certificate template. */
export const attachFile = mutation({
  args: {
    templateId: v.id("certificateTemplates"),
    fileId: v.id("_storage"),
  },
  handler: async (ctx, { templateId, fileId }) => {
    await requirePermission(ctx, "certificates.issue");
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    // Delete old file if replacing
    if (template.fileId) {
      await ctx.storage.delete(template.fileId);
    }
    await ctx.db.patch(templateId, { fileId });
  },
});

/** Get a download URL for a template's PDF file. */
export const getFileUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, { fileId }) => {
    await requireAuth(ctx);
    return await ctx.storage.getUrl(fileId);
  },
});

/** Issue a certificate to a student. */
export const issueToStudent = mutation({
  args: {
    templateId: v.id("certificateTemplates"),
    studentId: v.string(),
  },
  handler: async (ctx, { templateId, studentId }) => {
    const user = await requirePermission(ctx, "certificates.issue");
    return await ctx.db.insert("issuedCertificates", {
      templateId,
      studentId,
      issuedBy: user.externalId,
      issuedAt: new Date().toISOString(),
    });
  },
});

/** Revoke (delete) an issued certificate. */
export const revokeCertificate = mutation({
  args: { id: v.id("issuedCertificates") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "certificates.issue");
    await ctx.db.delete(id);
  },
});
