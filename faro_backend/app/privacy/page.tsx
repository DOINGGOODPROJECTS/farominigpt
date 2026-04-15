export const metadata = {
  title: 'Privacy Policy – Faro MiniGPT',
};

export default function PrivacyPage() {
  const updated = 'April 15, 2026';

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif', lineHeight: 1.7 }}>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {updated}</em></p>

      <h2>1. What this service does</h2>
      <p>
        Faro is an AI companion that helps underrepresented entrepreneurs discover the
        best places to start and grow their businesses—based on real opportunity, not
        guesswork. It provides city recommendations, comparisons, grants, and actionable
        insights directly inside ChatGPT.
      </p>

      <h2>2. Data we receive</h2>
      <p>
        When you use this Action, ChatGPT sends the parameters you provide (industry,
        budget, city names, etc.) to our API. We do not store, log, or share these
        request payloads beyond the time needed to generate a response.
      </p>

      <h2>3. Data we do not collect</h2>
      <ul>
        <li>We do not collect names, email addresses, or any personally identifiable information.</li>
        <li>We do not use cookies or tracking pixels.</li>
        <li>We do not sell data to third parties.</li>
      </ul>

      <h2>4. Third-party services</h2>
      <p>
        Responses are generated using Google Gemini. In the event Gemini is unavailable,
        requests may fall back to OpenAI or Anthropic Claude. Each provider&apos;s own
        privacy policy governs their handling of data.
      </p>

      <h2>5. Security</h2>
      <p>
        All API traffic is encrypted in transit via HTTPS. Access requires a bearer token
        that is never exposed to end users.
      </p>

      <h2>6. Changes</h2>
      <p>
        We may update this policy from time to time. The &ldquo;Last updated&rdquo; date at
        the top of this page reflects the most recent revision.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions? Email <a href="mailto:team@farosmart.com">team@farosmart.com</a>.
      </p>
    </main>
  );
}
