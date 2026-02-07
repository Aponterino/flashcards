interface StudySessionProps {
  deckId: string;
}

export default function StudySession({ deckId }: StudySessionProps) {
  return (
    <section className="card stack">
      <div className="row">
        <div>
          <h3>Study Session</h3>
          <p className="subtitle">Deck ID: {deckId}</p>
        </div>
        <button className="button primary" type="button">
          Start session
        </button>
      </div>

      <div className="session-card">
        <p className="eyebrow">Prompt</p>
        <p>What is the capital of France?</p>
        <div className="button-row">
          <button className="button ghost" type="button">
            Show answer
          </button>
          <button className="button" type="button">
            Mark good
          </button>
        </div>
      </div>
    </section>
  );
}
