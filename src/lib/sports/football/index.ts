import type { SportModule } from "../types";

const SLOT_LABELS: Record<string, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DEF: "D/ST",
  DL: "DL",
  LB: "LB",
  DB: "DB",
  IDP_FLEX: "IDP Flex",
  FLEX: "FLEX",
  WRRB_FLEX: "W/R",
  REC_FLEX: "W/T",
  SUPER_FLEX: "SUPERFLEX",
  BN: "Bench",
  IR: "IR",
  TAXI: "Taxi",
};

// Only the common keys are labelled. Anything unknown falls back to a
// readable version of the raw key, so a new Sleeper scoring option still
// renders sensibly instead of disappearing.
const SCORING_LABELS: Record<string, string> = {
  pass_yd: "Passing yards",
  pass_td: "Passing TD",
  pass_int: "Interception thrown",
  pass_2pt: "Passing 2PT",
  rush_yd: "Rushing yards",
  rush_td: "Rushing TD",
  rush_2pt: "Rushing 2PT",
  rec: "Reception",
  rec_yd: "Receiving yards",
  rec_td: "Receiving TD",
  rec_2pt: "Receiving 2PT",
  fum_lost: "Fumble lost",
  fum_rec_td: "Fumble recovery TD",
  bonus_rec_te: "TE reception bonus",
  fgm: "Field goal made",
  fgmiss: "Field goal missed",
  xpm: "Extra point made",
  xpmiss: "Extra point missed",
  def_st_td: "D/ST TD",
  def_td: "Defensive TD",
  sack: "Sack",
  int: "Interception",
  ff: "Forced fumble",
  fum_rec: "Fumble recovery",
  safe: "Safety",
  pts_allow_0: "Points allowed: 0",
  pts_allow_1_6: "Points allowed: 1–6",
  pts_allow_7_13: "Points allowed: 7–13",
  pts_allow_14_20: "Points allowed: 14–20",
  pts_allow_21_27: "Points allowed: 21–27",
  pts_allow_28_34: "Points allowed: 28–34",
  pts_allow_35p: "Points allowed: 35+",
};

const POSITION_COLORS: Record<string, string> = {
  QB: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  K: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  DEF: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export const football: SportModule = {
  id: "football",
  label: "Football",
  positionOrder: ["QB", "RB", "WR", "TE", "K", "DEF"],
  slotLabel: (code) => SLOT_LABELS[code] ?? code,
  scoringLabel: (key) =>
    SCORING_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  positionColor: (position) =>
    (position && POSITION_COLORS[position]) ?? "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
};
