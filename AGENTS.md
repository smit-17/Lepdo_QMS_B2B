<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Gold rates derive from 24KT (18KT 76%, 14KT 62%, 10KT 41%); manual per-karat overrides stored via metal_prices.manual. Why: user requirement.
- Margin % is per item in the Diamond step, added to price per carat; quotation-level margin is always 0. Why: user requirement.
- Customers deduped by match_key (last 10 mobile digits, else lowercased name). Why: avoid duplicate customers.
- PDF puts exactly one jewellery item per A4 page, each trying tighter densities; overflow is flagged, never truncated. Why: user requirement.
- Item metal options derive weights from the 14KT base (18KT x1.17, 10KT x0.88, Silver x0.80, Platinum x1.66); options and LGD/Moissanite totals are alternatives, never summed. Why: user requirement.
- Each diamond row stores its type (Lab-Grown by default for older rows); only that row's selected rate and amount propagate to summaries and PDF. Why: mixed-type items must quote both without exposing unused rates.
- Keep mobile quotation tables as readable stacked rows and reuse the local favicon for app/PDF branding. Why: narrow screens and unavailable remote logo assets must remain usable.
- Customers are saved only when name, mobile (7+ digits), address and seller are all filled; the picker hides older incomplete records instead of deleting them. Why: stop stray/test entries polluting the dropdown.
- Diamond rows may carry their own markup-on-cost margin; the item margin skips those rows unless "stack" is ticked. Why: avoid silently applying margin twice.
- Live Surat 24 KT rate + USD/INR are fetched server-side, last good value kept in app_config with stale flag; applied rates are snapshotted per quotation (applied_rates). Why: never show fabricated live values or change saved quotations.
