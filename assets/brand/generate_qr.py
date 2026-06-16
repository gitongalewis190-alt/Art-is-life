#!/usr/bin/env python3
"""Generate a branded QR code for Art Is Life Foundation.
Obsidian modules on a cream background (dark-on-light = universally
scannable polarity), rounded module style, gold ring+dot centre mark,
and a captioned card matching the site's visual identity.
"""
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw, ImageFont

URL = "https://art-is-life-iota.vercel.app"

GOLD       = (201, 168, 76)
GOLD_LIGHT = (232, 212, 139)
OBSIDIAN   = (15, 14, 12)
CREAM      = (250, 248, 243)

# ── 1. Build the QR matrix — dark modules on light background (correct
#       polarity for universal scanner compatibility), high error
#       correction so the centre logo doesn't break decoding ──────────
qr = qrcode.QRCode(
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=22,
    border=2,
)
qr.add_data(URL)
qr.make(fit=True)

qr_img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=RoundedModuleDrawer(radius_ratio=0.85),
    color_mask=SolidFillColorMask(back_color=CREAM, front_color=OBSIDIAN),
).convert("RGBA")

qr_w, qr_h = qr_img.size

# ── 2. Centre brand mark: gold ring + dot on obsidian (matches splash) ──
mark_d = int(qr_w * 0.22)
mark = Image.new("RGBA", (mark_d, mark_d), (0, 0, 0, 0))
md = ImageDraw.Draw(mark)
pad = int(mark_d * 0.04)
md.ellipse([pad, pad, mark_d - pad, mark_d - pad], fill=OBSIDIAN, outline=CREAM, width=max(3, int(mark_d*0.035)))
ring_w = max(3, int(mark_d * 0.08))
ring_pad = int(mark_d * 0.16)
md.ellipse([ring_pad, ring_pad, mark_d - ring_pad, mark_d - ring_pad], outline=GOLD_LIGHT, width=ring_w)
dot_r = int(mark_d * 0.13)
cx = cy = mark_d // 2
md.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=GOLD_LIGHT)

qr_img.alpha_composite(mark, ((qr_w - mark_d) // 2, (qr_h - mark_d) // 2))

# ── 3. Compose onto a gold-framed cream card with brand caption ───────
pad_top, pad_side, pad_bottom = 80, 70, 130
card_w = qr_w + pad_side * 2
card_h = qr_h + pad_top + pad_bottom
card = Image.new("RGB", (card_w, card_h), CREAM)
draw = ImageDraw.Draw(card)

# Thin gold double-frame around the whole card
draw.rounded_rectangle([18, 18, card_w - 19, card_h - 19], radius=22, outline=GOLD, width=3)
draw.rounded_rectangle([30, 30, card_w - 31, card_h - 31], radius=18, outline=GOLD_LIGHT, width=1)

# Soft obsidian inset behind the QR itself for crisp contrast
inset_pad = 22
inset = Image.new("RGBA", (qr_w + inset_pad * 2, qr_h + inset_pad * 2), (255, 255, 255, 0))
ImageDraw.Draw(inset).rounded_rectangle(
    [0, 0, inset.size[0] - 1, inset.size[1] - 1], radius=24, fill=(255, 255, 255, 255), outline=GOLD, width=3
)
card.paste(inset, (pad_side - inset_pad, pad_top - inset_pad), inset)
card.paste(qr_img, (pad_side, pad_top), qr_img)

def load_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

title_font = load_font([
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
], 38)
sub_font = load_font([
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
], 21)

title = "ART IS LIFE FOUNDATION"
sub = "SCAN TO VIEW THE GALLERY"

tw = draw.textlength(title, font=title_font)
draw.text(((card_w - tw) / 2, pad_top + qr_h + 26), title, font=title_font, fill=(40, 38, 34))

sw = draw.textlength(sub, font=sub_font)
draw.text(((card_w - sw) / 2, pad_top + qr_h + 76), sub, font=sub_font, fill=GOLD)

out_path = "/home/user/Art-is-life/assets/brand/qr-code.png"
card.save(out_path)
print("Saved:", out_path, card.size)
