"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";

type Overview = Awaited<ReturnType<typeof trpc.smsAutomation.overview.query>>;
type SequenceStepDraft = {
  templateId: string;
  delayMinutes: number;
  purpose: "transactional" | "marketing";
};

export default function SmsAutomationPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateTransactional, setTemplateTransactional] = useState(true);
  const [sequenceName, setSequenceName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<
    "lead.captured" | "reservation.status_changed" | "manual"
  >("lead.captured");
  const [leadKind, setLeadKind] = useState<"booking" | "callback" | "quote" | "generic">("booking");
  const [workflowState, setWorkflowState] = useState("");
  const [steps, setSteps] = useState<SequenceStepDraft[]>([
    { templateId: "", delayMinutes: 0, purpose: "transactional" },
  ]);
  const [selectedSequence, setSelectedSequence] = useState("");
  const [selectedContact, setSelectedContact] = useState("");
  const [aiPurpose, setAiPurpose] = useState(
    "Create a restaurant reservation confirmation and reminder sequence.",
  );

  async function load() {
    try {
      setOverview(await trpc.smsAutomation.overview.query());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load SMS automation.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const templateMap = useMemo(
    () => new Map((overview?.templates ?? []).map((template) => [template.id, template])),
    [overview],
  );

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    await run(
      () =>
        trpc.smsAutomation.createTemplate.mutate({
          name: templateName,
          body: templateBody,
          isTransactional: templateTransactional,
          category: "custom",
          locale: "en",
        }),
      "SMS template created.",
    );
    setTemplateName("");
    setTemplateBody("");
  }

  async function createSequence(event: FormEvent) {
    event.preventDefault();
    await run(
      () =>
        trpc.smsAutomation.createSequence.mutate({
          name: sequenceName,
          triggerEvent,
          triggerFilter: {
            leadKind,
            workflowState: workflowState || undefined,
            requireSmsConsent: steps.some((step) => step.purpose === "marketing") || undefined,
          },
          status: "paused",
          category: "custom",
          dailyCap: 100,
          steps: steps.map((step) => ({
            delay_minutes: step.delayMinutes,
            template_id: step.templateId,
            purpose: step.purpose,
          })),
        }),
      "SMS sequence saved in paused state.",
    );
    setSequenceName("");
  }

  async function generateWithAi() {
    setBusy(true);
    setError(null);
    setNotice("AI is drafting the SMS automation...");
    try {
      const started = await trpc.smsAutomation.startAiDraft.mutate({
        purpose: aiPurpose,
        intent: leadKind,
      });
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const job = await trpc.smsAutomation.getAiDraft.query({ jobId: started.jobId });
        if (job.status === "failed") throw new Error(job.errorMessage ?? "AI drafting failed.");
        if (job.status === "completed") {
          await trpc.smsAutomation.applyAiDraft.mutate({ jobId: started.jobId });
          setNotice("AI draft created. Review it before activation.");
          await load();
          return;
        }
      }
      throw new Error("AI drafting is still running. Refresh this page shortly.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI drafting failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const buttonClass =
    "inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400";

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">SMS automation</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
            Build short follow-up workflows for reservations, callbacks, and qualified leads.
            Transactional messages follow explicit requests; marketing steps require SMS consent.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className={buttonClass}
          onClick={() =>
            void run(
              () => trpc.smsAutomation.installRestaurantPresets.mutate(),
              "Restaurant SMS presets are ready.",
            )
          }
        >
          Install restaurant presets
        </button>
      </div>

      {notice ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="grid gap-6 border-b border-gray-200 py-6 lg:grid-cols-2">
        <form onSubmit={(event) => void createTemplate(event)} className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-950">Create SMS template</h2>
            <p className="text-sm text-gray-500">
              Keep the message direct and under 320 characters.
            </p>
          </div>
          <input
            className={inputClass}
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Template name"
            required
          />
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            value={templateBody}
            onChange={(event) => setTemplateBody(event.target.value.slice(0, 320))}
            placeholder="Hello {{first_name}}, your request at {{business_name}}..."
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={templateTransactional}
                onChange={(event) => setTemplateTransactional(event.target.checked)}
              />
              Transactional message
            </label>
            <span
              className={
                templateBody.length > 300 ? "font-semibold text-amber-700" : "text-gray-500"
              }
            >
              {templateBody.length}/320 characters,{" "}
              {templateBody.length === 0
                ? 0
                : templateBody.length <= 160
                  ? 1
                  : Math.ceil(templateBody.length / 153)}{" "}
              segment(s)
            </span>
          </div>
          <button className={buttonClass} disabled={busy}>
            Save template
          </button>
        </form>

        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-950">Draft with AI</h2>
            <p className="text-sm text-gray-500">
              AI prepares templates and timing. The result stays paused until you activate it.
            </p>
          </div>
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            value={aiPurpose}
            onChange={(event) => setAiPurpose(event.target.value)}
          />
          <button
            type="button"
            className={buttonClass}
            disabled={busy || aiPurpose.trim().length < 3}
            onClick={() => void generateWithAi()}
          >
            {busy ? "Working..." : "Create AI draft"}
          </button>
        </div>
      </section>

      <section className="border-b border-gray-200 py-6">
        <form onSubmit={(event) => void createSequence(event)} className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-950">Build sequence manually</h2>
            <p className="text-sm text-gray-500">
              Delays are relative to the previous step. Quiet hours default to 20:00-08:00,
              Europe/Zurich.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              className={inputClass}
              value={sequenceName}
              onChange={(event) => setSequenceName(event.target.value)}
              placeholder="Sequence name"
              required
            />
            <select
              className={inputClass}
              value={triggerEvent}
              onChange={(event) => setTriggerEvent(event.target.value as typeof triggerEvent)}
            >
              <option value="lead.captured">Lead captured</option>
              <option value="reservation.status_changed">Reservation status changed</option>
              <option value="manual">Manual enrollment</option>
            </select>
            <select
              className={inputClass}
              value={leadKind}
              onChange={(event) => setLeadKind(event.target.value as typeof leadKind)}
            >
              <option value="booking">Reservation</option>
              <option value="callback">Callback</option>
              <option value="quote">Quote</option>
              <option value="generic">General inquiry</option>
            </select>
            <input
              className={inputClass}
              value={workflowState}
              onChange={(event) => setWorkflowState(event.target.value)}
              placeholder="Workflow state (optional)"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3">Step</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Wait minutes</th>
                  <th className="py-2 pr-3">Purpose</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 pr-3 font-semibold text-gray-700">{index + 1}</td>
                    <td className="py-3 pr-3">
                      <select
                        className={inputClass}
                        value={step.templateId}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, templateId: event.target.value }
                                : item,
                            ),
                          )
                        }
                        required
                      >
                        <option value="">Choose template</option>
                        {(overview?.templates ?? []).map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        value={step.delayMinutes}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, delayMinutes: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        className={inputClass}
                        value={step.purpose}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    purpose: event.target.value as "transactional" | "marketing",
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="transactional">Transactional</option>
                        <option value="marketing">Marketing (consent required)</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        className="text-sm font-semibold text-red-600 disabled:text-gray-300"
                        disabled={steps.length === 1}
                        onClick={() =>
                          setSteps((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  { templateId: "", delayMinutes: 60, purpose: "transactional" },
                ])
              }
            >
              Add step
            </button>
            <button className={buttonClass} disabled={busy}>
              Save paused sequence
            </button>
          </div>
        </form>
      </section>

      <section className="border-b border-gray-200 py-6">
        <h2 className="text-base font-bold text-gray-950">Sequences</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Trigger</th>
                <th className="py-2 pr-3">Steps</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.sequences ?? []).map((sequence) => {
                const sequenceSteps = Array.isArray(sequence.steps)
                  ? (sequence.steps as Array<{ template_id: string; delay_minutes: number }>)
                  : [];
                return (
                  <tr key={sequence.id} className="border-b border-gray-100 align-top">
                    <td className="py-3 pr-3 font-semibold text-gray-900">{sequence.name}</td>
                    <td className="py-3 pr-3 text-gray-600">{sequence.triggerEvent}</td>
                    <td className="py-3 pr-3 text-gray-600">
                      {sequenceSteps
                        .map(
                          (step) =>
                            `${step.delay_minutes}m: ${templateMap.get(step.template_id)?.name ?? "Missing template"}`,
                        )
                        .join(" → ")}
                    </td>
                    <td className="py-3 pr-3 capitalize text-gray-700">{sequence.status}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        className="text-sm font-semibold text-blue-700"
                        onClick={() =>
                          void run(
                            () =>
                              trpc.smsAutomation.setSequenceStatus.mutate({
                                sequenceId: sequence.id,
                                status: sequence.status === "active" ? "paused" : "active",
                              }),
                            sequence.status === "active"
                              ? "Sequence paused."
                              : "Sequence activated.",
                          )
                        }
                      >
                        {sequence.status === "active" ? "Pause" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 py-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          <h2 className="text-base font-bold text-gray-950">Manual enrollment</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use this for a specific contact after reviewing their request and consent.
          </p>
          <div className="mt-4 space-y-3">
            <select
              className={inputClass}
              value={selectedSequence}
              onChange={(event) => setSelectedSequence(event.target.value)}
            >
              <option value="">Choose manual sequence</option>
              {(overview?.sequences ?? [])
                .filter((sequence) => sequence.triggerEvent === "manual")
                .map((sequence) => (
                  <option key={sequence.id} value={sequence.id}>
                    {sequence.name}
                  </option>
                ))}
            </select>
            <select
              className={inputClass}
              value={selectedContact}
              onChange={(event) => setSelectedContact(event.target.value)}
            >
              <option value="">Choose phone contact</option>
              {(overview?.contacts ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone}{" "}
                  ({contact.phone})
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !selectedSequence || !selectedContact}
              onClick={() =>
                void run(
                  () =>
                    trpc.smsAutomation.enrollContact.mutate({
                      sequenceId: selectedSequence,
                      contactId: selectedContact,
                    }),
                  "Contact enrollment queued.",
                )
              }
            >
              Enroll contact
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-gray-950">Recent enrollments</h2>
          <div className="mt-3 divide-y divide-gray-100 border-y border-gray-200">
            {(overview?.enrollments ?? []).map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-gray-900">
                    {overview?.sequences.find((sequence) => sequence.id === enrollment.sequenceId)
                      ?.name ?? "SMS sequence"}
                  </div>
                  <div className="text-gray-500">
                    Step {enrollment.currentStep + 1}, next run{" "}
                    {new Date(enrollment.nextRunAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="capitalize text-gray-600">{enrollment.status}</span>
                  {enrollment.status === "enrolled" || enrollment.status === "paused" ? (
                    <button
                      type="button"
                      className="font-semibold text-blue-700"
                      onClick={() =>
                        void run(
                          () =>
                            trpc.smsAutomation.setEnrollmentStatus.mutate({
                              enrollmentId: enrollment.id,
                              status: enrollment.status === "paused" ? "enrolled" : "paused",
                            }),
                          enrollment.status === "paused"
                            ? "Enrollment resumed."
                            : "Enrollment paused.",
                        )
                      }
                    >
                      {enrollment.status === "paused" ? "Resume" : "Pause"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
