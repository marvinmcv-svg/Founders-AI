import type { Metadata } from "next";
import { Briefcase, CalendarClock, Crosshair, UserRound } from "lucide-react";
import { FIX, TalentMock } from "@founders/mocks";
import { SignalTicker } from "@founders/mocks/animated";
import { ApiPromo } from "@/components/sections";
import { Block, CardGrid, CtaBand, ProductHero, Split } from "@/components/sections/kit";
import { SpinoutsMock, TrackersMock } from "@/components/mocks/signals";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: t("talent.meta.title"), description: t("talent.meta.description"), alternates: { canonical: "/signals/talent" } };

export default async function TalentSignals() {
  const vars = await getStatVars();
  const ticker = FIX.talent.map((s, i) => ({
    title: String(s.person_name),
    body: String(s.summary),
    category: String(s.type).replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    time: ["now", "6 min", "31 min", "1 hr", "2 hr", "5 hr"][i % 6] ?? "today",
  }));
  const sig = FIX.talent[0] ?? {};
  return (
    <>
      <ProductHero id="talent.hero" prefix="talent.hero" vars={vars}>
        <TalentMock />
      </ProductHero>
      <Block id="talent.overview" prefix="talent.overview" vars={vars}>
        <CardGrid prefix="talent.overview" vars={vars} icons={[<UserRound key="a" size={16} />, <CalendarClock key="b" size={16} />, <Briefcase key="c" size={16} />, <Crosshair key="d" size={16} />]} />
      </Block>
      <Split id="talent.feed" prefix="talent.feed" vars={vars} bullets>
        <div className="rounded-[18px] border border-line bg-paper p-5">
          <SignalTicker items={ticker} />
        </div>
      </Split>
      <Split id="talent.spinouts" prefix="talent.spinouts" vars={vars} reverse>
        <SpinoutsMock />
      </Split>
      <Split id="talent.trackers" prefix="talent.trackers" vars={vars} bullets>
        <TrackersMock />
      </Split>
      <ApiPromo
        id="talent.api"
        title={t("talent.api.h2")}
        lede={t("talent.api.lede")}
        endpoints={[
          ["GET", "/talent"],
          ["GET", "/talent/{signalId}"],
          ["GET", "/people/{personId}/talent-signals"],
          ["GET", "/searches/{searchId}"],
        ]}
        samplePath="/talent?min_score=8"
        sampleJson={JSON.stringify({ data: [sig], next_cursor: "c_2" }, null, 2)}
      />
      <CtaBand id="talent.closing" h2={t("talent.closing.h2")} body={t("talent.closing.body")} />
    </>
  );
}
