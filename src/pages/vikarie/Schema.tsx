const SCHEMA_URL =
  import.meta.env.VITE_SCHEMA_URL ??
  'https://web.skola24.se/timetable/timetable-viewer/sundbyberg.skola24.se/Ursvikskolan/';

export default function Schema() {
  return (
    <div className="flex min-h-full flex-col p-3 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            Schema
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Öppnar schemat i appen när webbsidan tillåter det.
          </p>
        </div>

        <a
          href={SCHEMA_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--blue)' }}
        >
          Öppna i ny flik
        </a>
      </div>

      <div
        className="min-h-[70dvh] flex-1 overflow-hidden rounded-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <iframe
          title="Schema"
          src={SCHEMA_URL}
          className="h-[78dvh] w-full border-0"
          loading="lazy"
        />
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Om schemat inte visas här blockerar schematjänsten inbäddning. Använd då knappen ovan.
      </p>
    </div>
  );
}
