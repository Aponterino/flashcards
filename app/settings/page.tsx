import Link from "next/link";

import ThemePaletteSelector from "@/components/preferences/ThemePaletteSelector";

export default function SettingsPage() {
  return (
    <section className="card stack">
      <div>
        <p className="eyebrow">Settings</p>
        <h1>Preferences</h1>
        <p className="subtitle">Manage appearance and deleted decks here.</p>
      </div>
      <div className="settings-list">
        <ThemePaletteSelector />
        <Link className="settings-item" href="/decks/deleted">
          <span className="settings-item-title">Deleted Decks</span>
          <span className="settings-item-summary">
            View deleted decks and permanently purge them when you are ready.
          </span>
        </Link>
      </div>
    </section>
  );
}
