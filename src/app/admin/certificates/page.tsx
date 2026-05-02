"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { useTranslations } from "next-intl";
import {
  Award,
  FileCheck2,
  Upload,
  Users,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CertificateManagerPage() {
  const t = useTranslations("admin.certificates");
  const tc = useTranslations("common");

  const templates = useQuery(api.certificates.listTemplates) ?? [];
  const issuedCerts = useQuery(api.certificates.getIssuedCertificates) ?? [];
  const students =
    (useQuery(api.users.listUsers) ?? []).filter(
      (u: any) => u.role === "student"
    );

  const createTemplateMut = useMutation(api.certificates.createTemplate);
  const deleteTemplateMut = useMutation(api.certificates.deleteTemplate);
  const generateUploadUrlMut = useMutation(api.certificates.generateUploadUrl);
  const attachFileMut = useMutation(api.certificates.attachFile);
  const issueToStudentMut = useMutation(api.certificates.issueToStudent);
  const revokeCertMut = useMutation(api.certificates.revokeCertificate);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [assigningId, setAssigningId] = useState<Id<"certificateTemplates"> | null>(null);
  const [selectedStudent, setSelectedStudent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<Id<"certificateTemplates"> | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createTemplateMut({
      name: newName.trim(),
      description: newDesc.trim(),
    });
    toast.success(t("templateCreated"));
    setNewName("");
    setNewDesc("");
    setShowAddForm(false);
  }

  async function handleDelete(id: any) {
    if (!confirm(t("confirmDeleteTemplate"))) return;
    await deleteTemplateMut({ id });
    toast.success(t("templateDeleted"));
  }

  async function handleUpload(templateId: any) {
    setUploadingId(templateId);
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) return;

    const uploadUrl = await generateUploadUrlMut();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await res.json();
    await attachFileMut({ templateId: uploadingId, fileId: storageId });
    toast.success(t("uploadSuccess"));
    setUploadingId(null);
    e.target.value = "";
  }

  async function handleIssue() {
    if (!assigningId || !selectedStudent) return;
    const student = students.find((s: any) => s.externalId === selectedStudent);
    await issueToStudentMut({
      templateId: assigningId,
      studentId: selectedStudent,
    });
    toast.success(t("issuedSuccess", { name: student?.name ?? "" }));
    setAssigningId(null);
    setSelectedStudent("");
  }

  async function handleRevoke(id: any) {
    if (!confirm(t("confirmRevoke"))) return;
    await revokeCertMut({ id });
    toast.success(t("revokeSuccess"));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Hidden file input for PDF upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => setShowAddForm((v) => !v)}
          variant={showAddForm ? "secondary" : "default"}
        >
          {showAddForm ? (
            <>
              <X className="me-1.5 h-4 w-4" /> {tc("cancel")}
            </>
          ) : (
            <>
              <Plus className="me-1.5 h-4 w-4" /> {t("addTemplate")}
            </>
          )}
        </Button>
      </div>

      {/* Add Template Form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("newTemplate")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder={t("templateName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Textarea
              placeholder={t("templateDesc")}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end">
              <Button onClick={handleCreate}>
                <Plus className="me-1.5 h-4 w-4" /> {tc("create")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificate Templates */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("templates")}</h2>
          <Badge variant="secondary">{templates.length}</Badge>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("noTemplates")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((template: any) => (
              <Card key={template._id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Award className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle>{template.name}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(template._id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={template.fileId ? "default" : "outline"}>
                      {t("pdf")}: {template.fileId ? t("uploaded") : t("noPdf")}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpload(template._id)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {template.fileId ? t("replacePdf") : t("uploadPdf")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setAssigningId(template._id);
                        setSelectedStudent("");
                      }}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {t("assignToStudent")}
                    </Button>
                  </div>

                  {/* Inline assign form */}
                  {assigningId === template._id && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                      <select
                        value={selectedStudent}
                        onChange={(e) => setSelectedStudent(e.target.value)}
                        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="">{t("selectStudent")}</option>
                        {students.map((s: any) => (
                          <option key={s.externalId} value={s.externalId}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" onClick={handleIssue} disabled={!selectedStudent}>
                        {tc("create")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAssigningId(null)}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Issued Certificates */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("studentCertificates")}</h2>
          <Badge variant="secondary">{issuedCerts.length}</Badge>
        </div>

        {issuedCerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("noCertificates")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t("noCertificatesDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {issuedCerts.map((cert: any) => {
              const template = templates.find(
                (tmpl: any) => tmpl._id === cert.templateId
              );
              const student = students.find(
                (s: any) => s.externalId === cert.studentId
              );
              return (
                <Card key={cert._id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Award className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">
                          {template?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("issued", {
                            name: student?.name ?? cert.studentId,
                            date: new Date(cert.issuedAt).toLocaleDateString(),
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(cert._id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                      {t("revoke")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
