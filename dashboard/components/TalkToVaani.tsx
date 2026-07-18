'use client';

import { useEffect, useRef, useState } from 'react';
import { VaaniClient, type VaaniState } from '@/lib/vaaniClient';

/**
 * The button a judge presses.
 *
 * It opens the exact same engine a phone call does — same STT, same brain, same voice,
 * same barge-in. The only difference is the transport, so this is a real demo rather
 * than a mock of one.
 */

const WS_URL =
  process.env.NEXT_PUBLIC_VAANI_WS_URL ?? 'ws://localhost:8080/browser-stream';

const LABEL: Record<VaaniState, string> = {
  idle: 'Talk to Vaani',
  connecting: 'Connecting…',
  listening: 'Listening — just speak',
  speaking: 'Vaani is speaking…',
};

export function TalkToVaani({ businessId }: { businessId?: string }) {
  const [state, setState] = useState<VaaniState>('idle');
  const [error, setError] = useState<string | null>(null);
  const client = useRef<VaaniClient | null>(null);

  // Never leave the microphone open behind us.
  useEffect(() => () => client.current?.stop(), []);

  const start = async () => {
    setError(null);
    const c = new VaaniClient(WS_URL, {
      onState: setState,
      onError: setError,
      onEnded: () => setState('idle'),
    });
    client.current = c;

    try {
      await c.start(businessId);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it and try again.'
          : 'Could not start the call.',
      );
      setState('idle');
    }
  };

  const stop = () => client.current?.stop();
  const live = state !== 'idle';

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* Ambient glow — indigo at rest, red on a live call. Signals "this is alive". */}
        <span
          className={`absolute inset-4 rounded-full blur-2xl transition-colors duration-500 ${
            live ? 'bg-red-500/30' : 'bg-indigo-500/30'
          }`}
        />

        {/* A slow breathing ring at rest invites the first tap; a ping while she speaks. */}
        {state === 'idle' && (
          <span className="absolute inset-6 animate-ping rounded-full bg-indigo-400/20 [animation-duration:2.5s]" />
        )}
        {state === 'speaking' && (
          <span className="absolute inset-6 animate-ping rounded-full bg-red-400/40" />
        )}
        {state === 'listening' && (
          <span className="absolute inset-2 rounded-full border-2 border-emerald-400/40" />
        )}

        <button
          onClick={live ? stop : start}
          disabled={state === 'connecting'}
          className={`relative flex h-32 w-32 items-center justify-center rounded-full text-base font-semibold shadow-xl transition
            ${
              live
                ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-400'
                : 'bg-indigo-500 text-white shadow-indigo-500/30 hover:bg-indigo-400'
            }
            disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="relative flex flex-col items-center leading-tight">
            <span className="text-2xl">{live ? '■' : '🎙'}</span>
            <span className="mt-1 text-xs">{live ? 'End' : 'Talk'}</span>
          </span>
        </button>
      </div>

      <p className="text-sm font-medium text-neutral-300">{LABEL[state]}</p>

      {live ? (
        <p className="max-w-xs text-center text-xs leading-relaxed text-neutral-500">
          Try: <span className="text-neutral-300">“Namaste, mujhe kal dental checkup ke liye
          appointment chahiye.”</span> Talk over her any time — she stops, like a person would.
        </p>
      ) : (
        <p className="max-w-xs text-center text-xs leading-relaxed text-neutral-500">
          Tap and speak in Hindi, English, or a mix. No app, no sign-up — this is the same
          engine that answers the phone.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
