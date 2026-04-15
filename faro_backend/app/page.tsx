export default function HomePage() {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <div>
        <h1>Atlas Backend API</h1>
        <p style={{ color: '#666', marginTop: '1rem' }}>
          API is running. View available endpoints at <a href="/api" style={{ color: '#0070f3' }}>/api</a>
        </p>
      </div>
    </div>
  );
}
