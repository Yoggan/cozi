# Pey Brand Assets & CoDi QR Rendering

Official brand assets from `https://docs.pey.mx/brand-assets`. Download and use these directly in checkout, mobile app, or documentation rather than recreating them.

## Official Assets

| Asset                         | Usage                                 | Direct URL                                           |
| :---------------------------- | :------------------------------------ | :--------------------------------------------------- |
| **Logotipo pey — azul**       | Light backgrounds                     | `https://docs.pey.mx/img/design/pey_blue.svg`        |
| **Logotipo pey — blanco**     | Dark backgrounds                      | `https://docs.pey.mx/img/design/pey-logo-blanco.svg` |
| **pey + CoDi — fondo claro**  | CoDi checkout / badges on light UI    | `https://docs.pey.mx/img/design/pey_codi_light.svg`  |
| **pey + CoDi — fondo oscuro** | CoDi checkout / badges on dark UI     | `https://docs.pey.mx/img/design/pey_codi_dark.svg`   |
| **Animación de pago CoDi**    | Loading / awaiting CoDi payment state | `https://docs.pey.mx/img/design/loading_codi.gif`    |

---

## Displaying a CoDi QR Code

1. Call `POST https://api.pey.mx/codi/qr` with `amount` (MXN), `concept`, `expiration` (seconds, or `0`), `numRef`, and optional `bankAccountId`.
2. Pey returns `201 Created`:
   ```json
   {
     "id": "35f8361d2b",
     "qrString": "{\"TYP\":20,\"v\":{\"DEV\":\"...\"},\"ic\":{\"IDC\":\"35f8361d2b\",...},\"CRY\":\"...\"}"
   }
   ```
3. Render `qrString` as a scannable QR code:
   - **Recommended QR settings:** Error correction level **`M`**, high contrast (black on white), quiet zone border `4`.
   - Alternatively, pass `"generateImage": true` in `POST /codi/qr` to receive a base64 `qrImage` directly from Pey.
4. Any Mexican banking app supporting CoDi can scan the QR and complete the transfer instantly over SPEI.
5. Listen for the `codi.qr.payment_received` webhook (matching `codiQrId === id`) to mark the order paid.
