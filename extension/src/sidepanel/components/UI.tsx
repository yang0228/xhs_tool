import type { ReactNode } from "react";
import { useAppStore } from "../stores/appStore";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    collect: (
      <>
        <path d="M4 4h10v4M4 4v16h16V10" />
        <path d="m10 14 10-10m-5 0h5v5" />
      </>
    ),
    library: (
      <>
        <rect x="3" y="4" width="6" height="16" rx="1" />
        <rect x="12" y="4" width="9" height="7" rx="1" />
        <rect x="12" y="14" width="9" height="6" rx="1" />
      </>
    ),
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z" />
      </>
    ),
    publish: (
      <>
        <path d="m3 11 18-8-7 18-3-7-8-3Zm8 3L21 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 3 4 0 1 3 3 1 3 3-2 2 0 3-3 3-3-1-3 1-3-3 1-3-2-2 3-3 3-1Z" />
      </>
    ),
    expand: (
      <>
        <path d="M14 3h7v7M21 3l-8 8M10 21H3v-7M3 21l8-8" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1" />
        <path d="m3 17 6-6 5 5 3-3 4 4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.edit}
    </svg>
  );
}
export function EmptyState({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="library" size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: string | null;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          重试
        </button>
      )}
    </div>
  );
}
export function ToastViewport() {
  const toasts = useAppStore((s) => s.toasts);
  const remove = useAppStore((s) => s.removeToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={"toast toast-" + t.type}
          role={t.type === "error" ? "alert" : "status"}
        >
          <span>{t.message}</span>
          <button aria-label="关闭提示" onClick={() => remove(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
