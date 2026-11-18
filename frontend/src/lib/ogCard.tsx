import { ImageResponse } from 'next/og';

// Link-preview card (Telegram, WhatsApp, Facebook, X...). Rendered by next/og at build time.
export const OG_SIZE = { width: 1200, height: 630 };

type CardOptions = {
  badge: string;
  title: string;
  subtitle: string;
  chips: string[];
  dark?: boolean;
};

function ToothMark({ color }: { color: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3.5c-2.2 0-3.5 1.8-3.5 4.2 0 2 .8 3.4 1.4 5 .6 1.7.7 3.6 1.2 5.6.4 1.6 1 2.7 2 2.7 1.2 0 1.4-1.6 1.7-3.3.3-1.5.6-2.7 2.2-2.7s1.9 1.2 2.2 2.7c.3 1.7.5 3.3 1.7 3.3 1 0 1.6-1.1 2-2.7.5-2 .6-3.9 1.2-5.6.6-1.6 1.4-3 1.4-5 0-2.4-1.3-4.2-3.5-4.2-1.9 0-3 1.2-5 1.2s-3.1-1.2-5-1.2z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function renderOgCard({ badge, title, subtitle, chips, dark = false }: CardOptions) {
  const bg = dark
    ? 'linear-gradient(135deg, #0B1F24 0%, #12343A 55%, #0D7377 140%)'
    : 'linear-gradient(135deg, #0A5458 0%, #0D7377 50%, #14A39A 100%)';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: bg,
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ToothMark color="#0D7377" />
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>DentaCare</div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              padding: '10px 22px',
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.10)',
            }}
          >
            {badge}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>
            {title}
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: 'rgba(255,255,255,0.82)', maxWidth: 940 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: 'flex',
                fontSize: 24,
                padding: '10px 20px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.14)',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
