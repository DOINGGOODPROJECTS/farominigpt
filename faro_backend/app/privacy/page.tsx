export const metadata = {
  title: 'Privacy Policy – Atlas MiniGPT',
};

export default function PrivacyPage() {
  const updated = 'April 15, 2025';

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif', lineHeight: 1.7 }}>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {updated}</em></p>

      <h2>1. What this service does</h2>
      <p>
        Atlas MiniGPT is a ChatGPT Action that recommends and compares U.S. cities for
        underrepresented entrepreneurs. Requests are forwarded to the Atlas AI engine and
        a structured JSON response is returned to ChatGPT.
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
        Responses are generated via a Make.com webhook connected to an AI model. Requests
        sent to the webhook are subject to Make&apos;s own privacy policy.
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
        Questions? Email <a href="mailto:admin@farosmart.com">admin@farosmart.com</a>.
      </p>
    </main>
  );
}
