import type { Fixture } from "@/app/data/fixtures";
import { getTeamCountryCode } from "@/app/data/fixtures";
import {
  formatVenueLine,
  fixtureMetaLabel,
  getVenueForMatch,
} from "./venues";

export type MundialFixture = {
  id: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  date: string;
  time: string;
  group: string | null;
  venueLine: string;
};

export function toMundialFixture(fixture: Fixture): MundialFixture {
  const venue = getVenueForMatch(fixture.id);
  return {
    id: fixture.id,
    home: fixture.home,
    away: fixture.away,
    homeCode: getTeamCountryCode(fixture.home) ?? "UN",
    awayCode: getTeamCountryCode(fixture.away) ?? "UN",
    date: fixture.date,
    time: fixture.time,
    group: fixtureMetaLabel(fixture.group),
    venueLine: formatVenueLine(venue),
  };
}

export const FALLBACK_FIXTURES: MundialFixture[] = [
  {
    id: 6,
    home: "Brazil",
    away: "Morocco",
    homeCode: "BR",
    awayCode: "MA",
    date: "2026-06-13",
    time: "22:00",
    group: null,
    venueLine: "Lincoln Financial Field · Philadelphia, USA",
  },
  {
    id: 4,
    home: "USA",
    away: "Paraguay",
    homeCode: "US",
    awayCode: "PY",
    date: "2026-06-13",
    time: "01:00",
    group: null,
    venueLine: "SoFi Stadium · Los Angeles, USA",
  },
  {
    id: 5,
    home: "Qatar",
    away: "Switzerland",
    homeCode: "QA",
    awayCode: "CH",
    date: "2026-06-13",
    time: "19:00",
    group: null,
    venueLine: "Levi's Stadium · Santa Clara, USA",
  },
];
