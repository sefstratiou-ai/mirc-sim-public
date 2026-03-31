import React from 'react';
import { AIRequestType } from '../ai/AIProvider';

type TokenBreakdown = Record<AIRequestType, { inputTokens: number; outputTokens: number; calls: number }>;

interface StatsDialogProps {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeTotalTokens: number;
  sessionBreakdown: TokenBreakdown;
  cumulativeBreakdown: TokenBreakdown;
  onClose: () => void;
  onReset: () => void;
  onResetCumulative: () => void;
}

const REQUEST_LABELS: Record<AIRequestType, string> = {
  channel_batch: 'Channel batches',
  channel_reply: 'Channel replies',
  pm_reply: 'PM replies',
  pm_followup: 'PM follow-ups',
  pm_summary: 'PM summaries',
  channel_users: 'Channel user lists',
  random_pm: 'Random PMs',
  language_detect: 'Language detection',
};

function getRows(breakdown: TokenBreakdown) {
  return (Object.entries(breakdown) as [AIRequestType, TokenBreakdown[AIRequestType]][])
    .filter(([, entry]) => entry.calls > 0)
    .sort((a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens));
}

export const StatsDialog: React.FC<StatsDialogProps> = ({
  inputTokens,
  outputTokens,
  totalTokens,
  cumulativeInputTokens,
  cumulativeOutputTokens,
  cumulativeTotalTokens,
  sessionBreakdown,
  cumulativeBreakdown,
  onClose,
  onReset,
  onResetCumulative,
}) => {
  const sessionRows = getRows(sessionBreakdown);
  const cumulativeRows = getRows(cumulativeBreakdown);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-frame"
        style={{ width: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">Token Statistics</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ padding: '16px', fontFamily: 'var(--font-main)', fontSize: '12px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Session</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Metric</th>
                <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0' }}>Input (prompt)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{inputTokens.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 0' }}>Output (completion)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{outputTokens.toLocaleString()}</td>
              </tr>
              <tr style={{ fontWeight: 'bold', borderTop: '1px solid #808080' }}>
                <td style={{ paddingTop: 4 }}>Total</td>
                <td style={{ paddingTop: 4, textAlign: 'right', fontFamily: 'monospace' }}>{totalTokens.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Cumulative (all sessions)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Metric</th>
                <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0' }}>Input (prompt)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{cumulativeInputTokens.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 0' }}>Output (completion)</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{cumulativeOutputTokens.toLocaleString()}</td>
              </tr>
              <tr style={{ fontWeight: 'bold', borderTop: '1px solid #808080' }}>
                <td style={{ paddingTop: 4 }}>Total</td>
                <td style={{ paddingTop: 4, textAlign: 'right', fontFamily: 'monospace' }}>{cumulativeTotalTokens.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ color: '#808080', fontSize: '10px', marginBottom: 12 }}>
            Session counts reset each page load. Cumulative counts persist across sessions for this client.
          </div>

          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Session Breakdown</div>
          {sessionRows.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Type</th>
                  <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Calls</th>
                  <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.map(([requestType, entry]) => (
                  <tr key={requestType}>
                    <td style={{ padding: '3px 0' }}>{REQUEST_LABELS[requestType]}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{entry.calls.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{(entry.inputTokens + entry.outputTokens).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#808080', fontSize: '10px', marginBottom: 12 }}>No AI calls recorded in this session yet.</div>
          )}

          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Cumulative Breakdown</div>
          {cumulativeRows.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Type</th>
                  <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Calls</th>
                  <th style={{ textAlign: 'right', paddingBottom: 4, borderBottom: '1px solid #808080' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {cumulativeRows.map(([requestType, entry]) => (
                  <tr key={requestType}>
                    <td style={{ padding: '3px 0' }}>{REQUEST_LABELS[requestType]}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{entry.calls.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{(entry.inputTokens + entry.outputTokens).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#808080', fontSize: '10px', marginBottom: 12 }}>No cumulative AI calls recorded yet.</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button className="win-button" onClick={onReset}>Reset Session</button>
            <button className="win-button" onClick={onResetCumulative}>Reset Cumulative</button>
            <button className="win-button primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
};
