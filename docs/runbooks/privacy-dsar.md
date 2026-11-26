# Data-subject requests (DSAR) & suppression

Deadline: **30 days** from receipt (GDPR one month; CCPA 45 days). The `privacy-sla` daily job flags requests due within 5 days and overdue ones (audit `dsar.overdue`); `/admin?tab=dsar` shows them in red.

## Handling a request (`/admin?tab=dsar` → open it)
1. **Identity**: the requester clicks the e-mailed link (status → verified). If e-mail isn't configured (H3) or they can't, verify another way (reply from the address, signed letter) and record how ("Mark verified" needs a note).
2. **Profiles**: tick the profiles that are this person (matched by e-mail, LinkedIn URL, name). Name-only matches need care — compare employer and location.
3. **Complete**:
   - ACCESS: the export is built from the linked profiles; it is e-mailed when Resend is set, otherwise download the JSON and send it from privacy@ by hand.
   - DELETE: erases the profiles everywhere (including customers' lists and notes) and adds the id, LinkedIn URL and e-mails (hashed) to the suppression list. **Irreversible.**
   - OPT_OUT (do not sell/share): withdraws the profiles from every product and removes contact data; suppressed too.
4. Reject only with a reason (e.g. identity could not be verified after two attempts).

Suppression is enforced in the database (D-068): a suppressed person can't be re-inserted by any pipeline, provider refresh, seed or import. To suppress without a request (e.g. a complaint by phone): DSAR tab → Suppression list.

Escalate to Legal (H6) for: requests from minors, law-enforcement requests, requests about special-category data, anything disputed.
