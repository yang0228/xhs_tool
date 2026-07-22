import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Draft, PaginatedResponse } from "../../shared/types";
import { apiGet, apiPut, type ApiIdentity } from "../lib/api";
import { decodeDraft, encodeDraft, type DraftDocument } from "../lib/drafts";
import { draftStatuses } from "../lib/creator";
import { localDateTime } from "../lib/publication";
import { readSettings } from "../lib/settings";
import { ErrorNotice } from "./UI";

type Item = { record: Draft; doc: DraftDocument; identity: ApiIdentity };
export default function PublishSchedule() {
  const [items, setItems] = useState<Item[]>([]),
    [day, setDay] = useState(() => localDateTime().slice(0, 10)),
    [all, setAll] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    void (async () => {
      const identity = await readSettings();
      const result: Item[] = [];
      let count = 0,
        page = 1,
        total = Infinity;
      while (count < total) {
        const data = await apiGet<PaginatedResponse<Draft>>(
          `/drafts?page=${page}&limit=100`,
          controller.signal,
          identity,
        );
        total = data.total;
        count += data.items.length;
        for (const record of data.items) {
          if (record.status !== "published")
            result.push({ record, doc: await decodeDraft(record), identity });
        }
        if (!data.items.length) break;
        page++;
      }
      if (!controller.signal.aborted) setItems(result);
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [revision]);
  const end = new Date(day + "T12:00:00");
  end.setDate(end.getDate() + 6);
  const until = localDateTime(end).slice(0, 10),
    today = localDateTime().slice(0, 10);
  const shown = items
    .filter(
      (item) =>
        !item.doc.planned_date ||
        all ||
        (item.doc.planned_date >= day && item.doc.planned_date <= until),
    )
    .sort((a, b) =>
      (a.doc.planned_date ?? "9999").localeCompare(
        b.doc.planned_date ?? "9999",
      ),
    );
  return (
    <section className="stack">
      <div className="card stack">
        <h3>发布排期</h3>
        <label>
          一周起始日期
          <input
            className="field"
            type="date"
            value={day}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          显示全部排期
        </label>
        <p className="help">
          {day} — {until}，同时展示未排期内容；共{" "}
          {
            items.filter(
              (i) => i.doc.planned_date && i.doc.planned_date < today,
            ).length
          }{" "}
          条逾期。日期仅作个人安排，由你手动发布。
        </p>
      </div>
      <ErrorNotice error={error} retry={() => setRevision((r) => r + 1)} />
      {busy && <p role="status">正在读取排期…</p>}
      {!busy && !shown.length && (
        <p className="muted">本周暂无待发布内容，可先创建选题。</p>
      )}
      {shown.map(({ record, doc, identity }) => (
        <div className="card stack" key={record.id}>
          <Link to={"/drafts/" + record.id}>
            <h3>{doc.title}</h3>
          </Link>
          <p className="help">
            {draftStatuses[record.status]} ·{" "}
            {doc.planned_date
              ? doc.planned_date < today
                ? "已逾期"
                : doc.planned_date === today
                  ? "今日待发布"
                  : "已安排"
              : "未排期"}
          </p>
          <label>
            调整计划日期
            <input
              className="field"
              type="date"
              disabled={busy}
              value={doc.planned_date ?? ""}
              onChange={async (e) => {
                const next = e.target.value || null;
                setBusy(true);
                setError(null);
                try {
                  await apiPut(
                    "/drafts/" + record.id,
                    {
                      ...(await encodeDraft({ ...doc, planned_date: next })),
                      expected_version: record.version,
                    },
                    undefined,
                    identity,
                  );
                  setRevision((r) => r + 1);
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "改期失败",
                  );
                  setBusy(false);
                }
              }}
            />
          </label>
          <Link className="text-button" to={"/publish?draft=" + record.id}>
            准备发布 →
          </Link>
        </div>
      ))}
    </section>
  );
}
