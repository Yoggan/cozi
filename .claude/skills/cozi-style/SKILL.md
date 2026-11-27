---
name: cozi-style
description: Cozi brand and visual style (colors, type, spacing, radii, components, voice, imagery) from the "Cozi - Brand + Design System" Figma file. Use whenever building, reviewing or writing copy for any Cozi UI (apps/native, apps/web, packages/ui), or producing marketing/brand assets for Cozi.
---

# Cozi Style

Source of truth: Figma "Cozi - Brand + Design System"
https://www.figma.com/design/rogHCj648B4zxvV2eUl6jp
Pages: 01 Mood board & principles · 02 Logo & app icon · 03 Foundations (variables) · 04 Components · 05 Screens.
If a value here disagrees with Figma page **03 Foundations**, Figma wins; update this file.

## The idea

**"Calma premium, cerca de ti."** Person-to-person payments with your `@handle`, for young people in Mexico. It should feel like money that is well looked after: calm, clear, human.

Four principles decide every call:

1. **Calma**: nothing shouts. Soft motion, generous space, never red for sending money.
2. **Cercanía**: we talk with "tú". Your @ is your account; your people are one tap away.
3. **Claridad**: the amount is always read first. One primary action per screen.
4. **Confianza**: premium without being cold. CoDi, no fees, no fine print.

Personality: tranquilos (no aburridos) · premium (no fríos) · cercanos (no infantiles) · claros (no técnicos) · seguros (no burocráticos).

## Color tokens

Always use semantic tokens, never raw hex in components. **Dark is the default mode**, and **Negro** (flat black, no photo) is the default theme. Dark surface and border values below are the Negro theme.

| Token                       | Dark (default)             | Light                         |
| --------------------------- | -------------------------- | ----------------------------- |
| `color/bg/canvas`           | `#000000`                  | `#FBF8F2`                     |
| `color/bg/surface`          | `#111111`                  | `#FFFFFF`                     |
| `color/bg/surface-raised`   | `#27272A`                  | `#F5EFE3`                     |
| `color/bg/glass`            | `#121212` @ 92%            | `#FFFFFF` @ 72% (`#FFFFFFB8`) |
| `color/bg/brand`            | `#0F3D2E`                  | `#0F3D2E`                     |
| `color/text/primary`        | `#FFFFFF`                  | `#0B0F0D`                     |
| `color/text/secondary`      | `#BCC6C0`                  | `#26302B`                     |
| `color/text/tertiary`       | `#9BA89F`                  | `#5E6B64`                     |
| `color/icon/secondary`      | `#9BA89F`                  | `#5E6B64`                     |
| `color/action/primary-bg`   | `#FFFFFF` (`#09090B` text) | `#09090B` (white text)        |
| `color/action/secondary-bg` | `#121212` @ 92%            | `#E8DFCF`                     |
| `color/status/success`      | `#22C55E`                  | `#15803D`                     |
| `color/status/error`        | `#F87171`                  | `#DC2626`                     |
| `color/status/warning`      | `#FBBF24`                  | `#B45309`                     |
| `color/money/received`      | `#22C55E`                  | `#15803D`                     |
| `color/money/sent`          | `#FFFFFF`                  | `#0B0F0D`                     |
| `color/border/subtle`       | `#FFFFFF` @ 8%             | `#0B0F0D` @ 8%                |
| `color/border/strong`       | `#1D6B53`                  | `#D6CAB4`                     |
| `color/nav/bg`              | `#111111`                  | `#FFFFFF`                     |
| `color/nav/border`          | white @ 8%                 | black @ 8%                    |
| `color/nav/active-bg`       | white @ 10%                | black @ 7%                    |
| `color/nav/active-fg`       | `#FFFFFF`                  | `#09090B`                     |
| `color/nav/inactive-fg`     | white @ 60%                | `#09090B` @ 50%               |
| `color/focus/ring`          | `#22C55E`                  | `#16A34A`                     |

Brand palette (exploration names, for marketing and naming only): Siempreverde `#0F3D2E` (brand), Bosque profundo `#0A2A20` (surfaces), Esmeralda `#22C55E` (action/success), Crema `#F5EFE3` (light bg / text), Arena `#E8DFCF` (secondary), Tinta `#0B0F0D` (dark bg).

### Money color rules (non-negotiable)

- **Received** = green (`money/received`).
- **Sent** = neutral (`money/sent`). Never red, never negative-looking.
- **Red only for errors** (failed payment, invalid field).

### User accents (personalization)

Accents only tint **highlights and selected states** (selected chip, avatar initials, switch on). Brand, text and status colors **never** change with the accent. Already implemented in [apps/native/lib/themes.ts](apps/native/lib/themes.ts) (`ACCENT_OPTIONS`).

| Accent              | `accent/solid` | `accent/soft`            | on-accent fg |
| ------------------- | -------------- | ------------------------ | ------------ |
| Esmeralda (default) | `#22C55E`      | `rgba(34,197,94,0.18)`   | `#052E16`    |
| Cielo               | `#38BDF8`      | `rgba(56,189,248,0.18)`  | `#082F49`    |
| Índigo              | `#818CF8`      | `rgba(129,140,248,0.2)`  | `#1E1B4B`    |
| Ámbar               | `#FBBF24`      | `rgba(251,191,36,0.18)`  | `#451A03`    |
| Rosa                | `#FB7185`      | `rgba(251,113,133,0.18)` | `#4C0519`    |

## Typography

One family: **Plus Jakarta Sans**. ExtraBold for display, SemiBold for UI, Regular for text. **Tabular figures (`font-variant-numeric: tabular-nums`) for every amount.**

| Style         | Weight        | Size / line-height | Tracking      | Example                       |
| ------------- | ------------- | ------------------ | ------------- | ----------------------------- |
| Display/XL    | 800 ExtraBold | 56 / 1.0           | -3            | `cozi`                        |
| Display/L     | 700 Bold      | 40 / 1.1           | -2            | Manda dinero                  |
| Title/L       | 700 Bold      | 28 / 1.2           | -1            | Actividad reciente            |
| Title/M       | 600 SemiBold  | 22 / 1.25          | -0.5          | Vincula tu cuenta             |
| Body/L        | 400 Regular   | 17 / 1.45          | 0             | Agrega tu CLABE una sola vez. |
| Body/M        | 400 Regular   | 15 / 1.45          | 0             | Sin comisiones · CoDi         |
| Body/M Strong | 600 SemiBold  | 15 / 1.45          | 0             | @jorgezazueta                 |
| Label/M       | 600 SemiBold  | 15 / 1.2           | 0             | Enviar                        |
| Label/S       | 600 SemiBold  | 13 / 1.2           | +2, UPPERCASE | MOVIMIENTOS                   |
| Label/Tab     | 600 SemiBold  | 11 / 14            | +0.15         | Actividad                     |
| Caption       | 500 Medium    | 12 / 1.3           | 0             | Hoy, 2:05 p.m.                |
| Amount/XL     | 700 Bold      | 56 / 1.0           | -3            | $1,250.00                     |
| Amount/M      | 600 SemiBold  | 20 / 1.2           | -0.5          | $85.50                        |

Tracking values are in px (Figma letterSpacing).

## Spacing and radius

- Spacing scale (px): `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`. Don't invent in-between values.
- Radius: `sm 8` · `md 16` · `lg 24` · `xl 32` · `pill 999`.
  - Buttons, chips, tab bar, handle chip: `pill`.
  - Inputs, toasts: `md`. Cards: `lg`. Bottom sheet top corners, section containers: `xl`.

## Alignment rules

- **Screen gutter 16** (`layout/screen-gutter`) for headers, section titles, cards and the tab bar, so they share one left and right edge. Don't use 20 as a screen margin. If a component already has its own 16, don't add the container's.
- **Tab bar:** screen width minus 16 per side, 66 high (`layout/tabbar-height`), 6 above the safe area (minimum 10).
- **Clearance:** scrolling content leaves `layout/tabbar-clearance` (80) plus the safe area free, so the last item clears the tab bar.

## Components (Figma page 04)

Build with tokens; names below match Figma component names so Code Connect can map them later.

- **Button**: `Style = Primary | Secondary | Ghost`, `Size = L (56h) | M (44h)`, pill. Primary = `action/primary-bg` with inverse text (white on dark and on any backdrop); Secondary = `action/secondary-bg` + `border/subtle`; Ghost = no fill, `text/primary`. Never cream, green or blue. Label/M. One Primary per screen. In code: `primaryAction` / `primaryActionText` in [apps/native/lib/themes.ts](apps/native/lib/themes.ts) and `--accent` in [apps/native/global.css](apps/native/global.css).
- **TextField**: `Type = Text | Handle`, `State = Default | Focused | Error`. Label (Caption, `text/secondary`) above, leading icon (`envelope-simple` or `at`), surface fill, `border/subtle`. Focused = `focus/ring` border. Error = `status/error` border plus helper text below ("Revisa este campo.").
- **Avatar**: `S 32 · M 44 · L 64`, circle, `surface-raised` fill, accent-colored initials.
- **HandleChip**: pill, `@` icon + `@handle` in Body/M Strong.
- **AmountDisplay**: `Tone = Neutral | Received`. Caption line ("Recibiste de @ana.lu"), Amount/XL, meta line ("MXN · CoDi · Sin comisión"). Centered.
- **ActivityRow** (68h): `Direction = Received | Sent | Failed`. Avatar M, name (Body/M Strong) + time (Caption), trailing Amount/M. Received green, Sent neutral, Failed red amount and red time.
- **Card**: `Style = Glass | Solid`, radius lg, `border/subtle`, Title/M + Body/M secondary.
- **Toast** (48h): `Type = Success | Error | Info`, icon `check-circle | warning-circle | at`, Label/M.
- **TabItem / TabBar**: solid pill bar (`nav/bg`, `nav/border`, no blur or gloss), inner padding 6 x 5, three equal tabs: Inicio, Actividad, Mensajes. Active = `nav/active-bg` pill with `nav/active-fg` icon and label (no accent); inactive = `nav/inactive-fg`. Icon 20, Label/Tab.
- **BottomSheet**: `surface` fill, top radius xl, grabber, Title/L, Body/M, full-width Primary L button.
- **v1.1**: Switch (On/Off, 48x28), ListItem (`Trailing = Chevron | Switch | Value`, 64h), FilterChip (Selected True/False), Keypad (PIN / amount entry).

### Icons

Phosphor icon set, Regular weight, 24px default (16px inline in captions). Fill variants only for the active tab (`wallet-fill`, `receipt-fill`). Inactive icons use `icon/secondary`. Icons in Figma: arrow-down/left/up, at, bank, caret-right, check, check-circle, envelope-simple, export, eye, lock-simple, magnifying-glass, plus, qr-code, receipt(-fill), user, user-circle, wallet(-fill), warning-circle, x, x-circle, gear-six, bell-simple, shield-check, question, scan, fingerprint, copy, clock, sign-out, palette, file-text, key, backspace, share-network, download-simple, chat-circle-text, arrows-clockwise, lightning. Reuse these before adding new ones.

## Logo

- Wordmark: `cozi`, lowercase, Plus Jakarta Sans ExtraBold (Display/XL).
- Symbol: **Option A "Arroba-c"** (marked Recomendado): an open c hugging a dot, reads as @, c and coin; holds up at 16px. Component `Logo/Symbol` on page 04.
- App icon: symbol centered at ~56% of the tile on `bg/brand`. Lockup: symbol left of wordmark.
- Options B and C on page 02 are explorations; don't ship them.

## Voice and copy (Spanish, MX)

Talk with **tú**, short, no jargon, no error codes.

| Sí                                              | No                                       |
| ----------------------------------------------- | ---------------------------------------- |
| Manda tu primer pago.                           | Realice su primera transferencia.        |
| Listo, ya le llegó a @ana.lu.                   | Operación procesada exitosamente.        |
| Agrega tu CLABE una sola vez.                   | Ingrese su Clave Bancaria Estandarizada. |
| No pudimos completar el pago. Intenta de nuevo. | Error 402: transacción rechazada.        |

- Amounts: `$1,250.00`, currency `MXN` in the meta line. Time: `Hoy, 2:05 p.m.`.
- Separate meta with `·` (middle dot).
- Always name the person by `@handle` in confirmations.
- Say "sin comisión" / "CoDi" plainly when relevant (trust).

## Imagery

Dark, close-up nature: ferns, moss, leaf with water drop, sage silk, forest at night, light through leaves.

- Dark and humid: deep greens, low light.
- Macro: texture before landscape.
- No people, no office stock.
- Always leave room for text on top.

Backdrop images already exist in [apps/native/assets/themes/](apps/native/assets/themes/).

## Checklist before shipping a screen

- [ ] Only semantic tokens; works in dark (default) and light.
- [ ] Amount is the first thing read; tabular numbers.
- [ ] Sent money is neutral, received is green, red only for errors.
- [ ] One Primary button.
- [ ] Accent only on highlights/selected states.
- [ ] Spacing and radii on the scale.
- [ ] Copy uses "tú", no jargon, no error codes.
- [ ] Focus ring visible (`focus/ring`), text contrast on glass checked.
