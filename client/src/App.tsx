import { useState, useCallback } from 'react';

type Status = {
  hasDSL: boolean;
  page: { id: string; name: string; width: number; height: number } | null;
  sectionCount: number;
  hasReactOutput: boolean;
  patchCount: number;
};

type GenerateResult = {
  previewHTMLSize: number;
  reactOutput: {
    appTSXSize: number;
    appCSSSize: number;
    sectionCount: number;
    sections: { fileName: string; size: number }[];
  };
};

type ActiveTab = 'upload' | 'preview' | 'code';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [previewHTML, setPreviewHTML] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const api = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`/api/v1${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, []);

  const fetchStatus = useCallback(async () => {
    const data = await api('/status');
    setStatus(data);
  }, [api]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await api('/dsl', { method: 'POST', body: JSON.stringify(json) });
      await fetchStatus();
      setActiveTab('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, fetchStatus]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/generate', { method: 'POST' });
      setResult(data.reactOutput);
      setPreviewHTML(data.previewHTML);
      await fetchStatus();
      setActiveTab('code');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, fetchStatus]);

  const handleReset = useCallback(async () => {
    await api('/reset', { method: 'POST' });
    setStatus(null);
    setResult(null);
    setPreviewHTML('');
    setActiveTab('upload');
  }, [api]);

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>DSL2React</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>MasterGo DSL → React Code</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['upload', 'preview', 'code'] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: activeTab === tab ? '#1677ff' : '#fff',
              color: activeTab === tab ? '#fff' : '#333',
              cursor: 'pointer',
            }}
          >
            {tab === 'upload' ? 'Upload DSL' : tab === 'preview' ? 'Preview' : 'React Code'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleReset} style={{ padding: '8px 16px', border: '1px solid #ff4d4f', borderRadius: 6, background: '#fff', color: '#ff4d4f', cursor: 'pointer' }}>
          Reset
        </button>
      </div>

      {error && <div style={{ padding: 12, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, marginBottom: 16, color: '#ff4d4f' }}>{error}</div>}

      {loading && <div style={{ padding: 12, background: '#e6f7ff', borderRadius: 6, marginBottom: 16 }}>Processing...</div>}

      {activeTab === 'upload' && (
        <div>
          <div style={{ border: '2px dashed #ddd', borderRadius: 8, padding: 48, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ color: '#999', marginBottom: 16 }}>Upload machine-dsl.json</p>
            <input type="file" accept=".json" onChange={handleFileUpload} />
          </div>
          {status?.hasDSL && (
            <div style={{ padding: 16, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
              <p>Loaded: {status.page?.name} ({status.page?.width}x{status.page?.height})</p>
              <p>Sections: {status.sectionCount}</p>
              <button onClick={handleGenerate} style={{ marginTop: 8, padding: '8px 24px', background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Generate React Code
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'preview' && previewHTML && (
        <div>
          <iframe
            srcDoc={previewHTML}
            style={{ width: '100%', height: 600, border: '1px solid #ddd', borderRadius: 6 }}
            title="Preview"
          />
        </div>
      )}

      {activeTab === 'code' && result && (
        <div>
          <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 6, marginBottom: 16 }}>
            <p>App.tsx ({result.appTSXSize} chars) &middot; App.css ({result.appCSSSize} chars) &middot; {result.sectionCount} sections</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => downloadFile('App.tsx', '// Generated by DSL2React\n')} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>
              Download App.tsx
            </button>
            <button onClick={() => downloadFile('App.css', '/* Generated by DSL2React */\n')} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>
              Download App.css
            </button>
          </div>
          <h3>Sections</h3>
          <ul>
            {result.sections.map(s => (
              <li key={s.fileName} style={{ marginBottom: 4 }}>
                {s.fileName} ({s.size} chars)
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'preview' && !previewHTML && (
        <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
          Upload DSL and click Generate first.
        </div>
      )}

      {activeTab === 'code' && !result && (
        <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
          Upload DSL and click Generate first.
        </div>
      )}
    </div>
  );
}
