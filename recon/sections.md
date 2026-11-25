# recon/sections.md — ordered section IDs per R1 page

Structural-parity checklist (plan 2.5 / 15). Derived from the plan's Section 6 page specs and implemented as `data-section` attributes; `e2e/tests/www.parity.spec.ts` asserts each page renders exactly these, in order. REA captures of the reference site were not run in this pass (see docs/decisions.md D-011).

## `/`
- `home.hero`
- `home.logos`
- `home.split`
- `home.problem`
- `home.data`
- `home.signals`
- `home.sourcing`
- `home.monitor`
- `home.testimonials`
- `home.workflow`
- `home.latam`
- `home.closing`

## `/platform`
- `platform.hero`
- `platform.logos`
- `platform.discovery`
- `platform.sourcing`
- `platform.monitoring`
- `platform.data`
- `platform.comparison`
- `platform.testimonials`
- `platform.closing`

## `/companies`
- `companies.hero`
- `companies.logos`
- `companies.overview`
- `companies.profile`
- `companies.competitors`
- `companies.api`
- `companies.testimonials`
- `companies.closing`

## `/people`
- `people.hero`
- `people.logos`
- `people.overview`
- `people.highlights`
- `people.signals`
- `people.api`
- `people.privacy`
- `people.closing`

## `/investors`
- `investors.hero`
- `investors.logos`
- `investors.overview`
- `investors.backers`
- `investors.api`
- `investors.closing`

## `/transactions`
- `transactions.hero`
- `transactions.logos`
- `transactions.overview`
- `transactions.carries`
- `transactions.api`
- `transactions.closing`

## `/pricing`
- `pricing.hero`
- `pricing.plans`
- `pricing.faq`
- `pricing.logos`
- `pricing.closing`

## `/contact`
- `contact.main`

## `/partners`
- `partners.hero`
- `partners.logos`
- `partners.types`
- `partners.why`
- `partners.form`
- `partners.closing`
