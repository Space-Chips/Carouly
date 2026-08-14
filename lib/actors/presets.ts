/**
 * The casting library.
 *
 * A run used to invent whoever appeared on camera. The casting model read the
 * brand, wrote a paragraph about a person, and that person existed for exactly
 * one video — which is why two videos for the same brand looked like two
 * different companies. Saved actors fixed the second run onward; this fixes the
 * first, by having a shelf of people you can point at before anything is
 * generated.
 *
 * A preset is a *description*, not a photograph. That distinction is the whole
 * design: the master frame is generated at cast time from `look`, in the
 * template's own visual style, so the same preset comes back as a phone selfie
 * in the UGC formats and as a steady portrait in the founder one. A shelf of
 * fixed headshots would have to be one or the other, and would drag its own
 * lighting into every template it touched.
 *
 * `look` therefore has to carry its weight as an image prompt on its own: age,
 * build, hair, face, and the room, written the way the templates write their own
 * casting paragraphs. Everything downstream — the portrait in the picker, the
 * frame in the run, the note handed to the script — reads this one field.
 */

export type ActorPreset = {
  id: string;
  /** A first name, because that is how a director refers to somebody. */
  name: string;
  /** What they are, in three or four words. The line under the name. */
  persona: string;
  /** The identity paragraph. Doubles as an image prompt — see the note above. */
  look: string;
  wardrobe: string;
  /** How they speak, handed to the script so the lines sound like them. */
  voice: string;
  /** Where they film themselves. Also the setting tag that gets scored. */
  setting: string;
  /** Three at most: what a person scans to tell two cards apart. */
  tags: string[];
  /**
   * Scored against the brand's match profile, exactly like a template's block.
   * Same keys, same vocabulary, same `similarity` — so "who should be on camera"
   * is answered the same way as "what should this look like", and a brand whose
   * profile is empty falls back to library order rather than to a coin toss.
   */
  match: {
    tone: string[];
    settings: string[];
    audience: string[];
    funnel_stage?: string[];
  };
};

export const ACTOR_PRESETS: ActorPreset[] = [
  {
    id: "nadia",
    name: "Nadia",
    persona: "Cafe owner, late 30s",
    look: "A woman in her late thirties with warm brown skin, dark curly hair tied back with loose strands at the temples, faint laugh lines, a small mole on her left cheek, no makeup, standing behind the counter of a small independent cafe with a chalkboard menu, a stack of ceramic cups and a scratched espresso machine behind her.",
    wardrobe: "A dark green canvas apron over a soft grey t-shirt, sleeves pushed up, a thin gold chain.",
    voice: "Warm and unhurried, talks in short sentences, laughs at the end of her own point.",
    setting: "small-shop",
    tags: ["30s", "warm", "small business"],
    match: {
      tone: ["warm", "plain-spoken", "empathetic", "confident"],
      settings: ["small-shop", "cafe", "kitchen", "counter"],
      audience: ["small business owner", "shop owner", "hospitality", "founder"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "tom",
    name: "Tom",
    persona: "Warehouse manager, 40s",
    look: "A man in his mid forties with a shaved head, a greying stubble beard, weathered pale skin and deep-set eyes, broad shouldered, standing in a working warehouse aisle with pallet racking, shrink-wrapped stock and a scanner clipped to his belt.",
    wardrobe: "A hi-vis vest over a navy hoodie, sleeves pushed up, work gloves stuffed in a pocket.",
    voice: "Blunt and dry, no wasted words, mildly unimpressed by everything.",
    setting: "warehouse",
    tags: ["40s", "dry", "operations"],
    match: {
      tone: ["dry-wit", "contrarian", "plain-spoken", "blunt"],
      settings: ["warehouse", "shop-floor", "depot", "workshop"],
      audience: ["operations", "logistics", "manufacturing", "trade"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "priya",
    name: "Priya",
    persona: "Agency founder, 30s",
    look: "A woman in her early thirties with South Asian features, straight black hair cut to the shoulder and tucked behind one ear, dark eyes, a small silver nose stud, sitting at a cluttered desk with two monitors, a half-drunk flat white and a wall of pinned printouts behind her.",
    wardrobe: "A cream ribbed knit jumper with the sleeves pulled over her hands, hoop earrings.",
    voice: "Quick and precise, thinks out loud, corrects herself mid-sentence and carries on.",
    setting: "home-office",
    tags: ["30s", "quick", "agency"],
    match: {
      tone: ["confident", "fast", "plain-spoken", "contrarian"],
      settings: ["home-office", "desk", "studio", "office"],
      audience: ["agency", "marketer", "freelancer", "founder", "creative"],
      funnel_stage: ["consideration"],
    },
  },
  {
    id: "marcus",
    name: "Marcus",
    persona: "Software founder, 30s",
    look: "A man in his mid thirties with dark brown skin, short cropped hair, a neat beard and rectangular glasses, sitting in a small office with an exposed brick wall, a whiteboard covered in half-erased diagrams and a monitor glowing off to one side.",
    wardrobe: "A plain charcoal t-shirt under an unzipped grey fleece, a laptop-worn wristwatch.",
    voice: "Even and considered, explains mechanics rather than benefits, never oversells.",
    setting: "office",
    tags: ["30s", "considered", "software"],
    match: {
      tone: ["plain-spoken", "confident", "earnest", "technical"],
      settings: ["office", "desk", "studio", "app-ui", "screen"],
      audience: ["software", "saas", "technical", "founder", "developer"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "maya",
    name: "Maya",
    persona: "Nurse, 50s",
    look: "A woman in her early fifties with olive skin, silver-streaked dark hair pinned up, reading glasses pushed onto her head, fine lines around her eyes, standing in the corridor of a small clinic with a noticeboard, a hand-sanitiser dispenser and a strip light overhead.",
    wardrobe: "Navy scrubs with a lanyard, a plain wedding band, a pen in the breast pocket.",
    voice: "Calm and matter-of-fact, the register of somebody who has explained this a hundred times.",
    setting: "clinic",
    tags: ["50s", "calm", "healthcare"],
    match: {
      tone: ["calm", "empathetic", "plain-spoken", "reassuring"],
      settings: ["clinic", "practice", "office", "care"],
      audience: ["healthcare", "clinic", "practitioner", "care", "patient"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "jonah",
    name: "Jonah",
    persona: "Student, early 20s",
    look: "A man in his early twenties with pale freckled skin, messy ginger hair, thin build, an unbrushed look about him, sitting on the floor of a student room with a duvet behind him, fairy lights on the wall and an open laptop balanced on a stack of books.",
    wardrobe: "An oversized band t-shirt and a zip hoodie, a beaded bracelet.",
    voice: "Fast and self-deprecating, talks in fragments, over-explains the joke.",
    setting: "bedroom",
    tags: ["20s", "fast", "student"],
    match: {
      tone: ["dry-wit", "fast", "playful", "candid"],
      settings: ["bedroom", "campus", "home", "student"],
      audience: ["student", "gen z", "consumer", "young professional"],
      funnel_stage: ["awareness"],
    },
  },
  {
    id: "amara",
    name: "Amara",
    persona: "Salon owner, 40s",
    look: "A woman in her early forties with deep brown skin, long braids gathered over one shoulder, sharp cheekbones and a gold hoop in each ear, standing in a salon with a mirrored station behind her, product bottles lined up and a chair half in frame.",
    wardrobe: "A black wrap top with the sleeves rolled, a tape measure of shears in an apron pocket.",
    voice: "Direct and funny, tells you what you need rather than what you asked for.",
    setting: "salon",
    tags: ["40s", "direct", "beauty"],
    match: {
      tone: ["confident", "dry-wit", "warm", "direct"],
      settings: ["salon", "small-shop", "studio", "chair"],
      audience: ["beauty", "salon", "consumer", "small business owner"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "kai",
    name: "Kai",
    persona: "Personal trainer, 20s",
    look: "A person in their late twenties with East Asian features, an undercut with the top pushed back, a lean athletic build and a faint sheen of sweat, standing in the corner of a gym with racked dumbbells, rubber flooring and a chalk bucket behind them.",
    wardrobe: "A charcoal training top with the sleeves cut off, a fabric wrist strap.",
    voice: "Energetic but unshowy, counts things off, ends on the practical instruction.",
    setting: "gym",
    tags: ["20s", "energetic", "fitness"],
    match: {
      tone: ["energetic", "fast", "confident", "motivating"],
      settings: ["gym", "studio", "outdoors", "training"],
      audience: ["fitness", "consumer", "coach", "wellness"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "greta",
    name: "Greta",
    persona: "Maker, 60s",
    look: "A woman in her sixties with pale lined skin, short white hair, wire-framed glasses and strong hands, standing at a workbench in a workshop with hand tools on a pegboard, sawdust on the surface and afternoon light from a high window.",
    wardrobe: "A faded denim work shirt with rolled sleeves over a canvas apron, no jewellery.",
    voice: "Slow, certain, allergic to exaggeration. Says the number rather than the adjective.",
    setting: "workshop",
    tags: ["60s", "certain", "craft"],
    match: {
      tone: ["earnest", "plain-spoken", "understated", "contrarian"],
      settings: ["workshop", "studio", "warehouse", "bench"],
      audience: ["craft", "maker", "manufacturing", "founder", "artisan"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "diego",
    name: "Diego",
    persona: "Restaurant manager, 30s",
    look: "A man in his early thirties with tan skin, dark hair pushed back, a trimmed beard and tired friendly eyes, standing in a restaurant before service with upturned chairs behind him, a service pass and a printed rota taped to the wall.",
    wardrobe: "A white shirt with the top button open and the sleeves rolled, a black apron tied at the waist.",
    voice: "Quick, hospitable, drops into practical detail — covers, timings, headcount.",
    setting: "restaurant",
    tags: ["30s", "practical", "hospitality"],
    match: {
      tone: ["warm", "fast", "plain-spoken", "practical"],
      settings: ["restaurant", "small-shop", "kitchen", "counter"],
      audience: ["hospitality", "restaurant", "small business owner", "operations"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "isabelle",
    name: "Isabelle",
    persona: "Finance lead, 40s",
    look: "A woman in her mid forties with fair skin, blonde hair in a low bun, minimal makeup and a level gaze, sitting in a quiet office corner with a window blind half drawn, a closed laptop and a single notebook squared on the desk.",
    wardrobe: "A navy blazer over a white shirt, small stud earrings, no watch.",
    voice: "Measured and exact. Qualifies claims, and the qualification is the point.",
    setting: "office",
    tags: ["40s", "measured", "finance"],
    match: {
      tone: ["confident", "measured", "plain-spoken", "professional"],
      settings: ["office", "desk", "boardroom", "screen"],
      audience: ["finance", "enterprise", "b2b", "executive", "operations"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "sam",
    name: "Sam",
    persona: "Van-based tradesperson, 30s",
    look: "A person in their mid thirties with weathered skin, a buzz cut growing out, a small scar through one eyebrow and paint-flecked forearms, standing at the open back doors of a work van with ladders, cable drums and toolboxes stacked inside.",
    wardrobe: "A grey work polo, cargo trousers with a knee pad strap, a tool belt.",
    voice: "Straight to the point, mild sarcasm, ends on the money or the time saved.",
    setting: "van",
    tags: ["30s", "blunt", "trade"],
    match: {
      tone: ["blunt", "dry-wit", "plain-spoken", "contrarian"],
      settings: ["van", "site", "outdoors", "workshop", "shop-floor"],
      audience: ["trade", "contractor", "field service", "small business owner"],
      funnel_stage: ["consideration", "conversion"],
    },
  },
  {
    id: "luna",
    name: "Luna",
    persona: "Travel creator, 20s",
    look: "A woman in her late twenties with warm olive skin, long chestnut hair falling naturally around her face and a thoughtful expression, sitting barefoot on a weathered wooden deck beneath coconut palms while reading an open paperback. The frame feels like a casual phone recommendation filmed on a quiet trip.",
    wardrobe: "A simple white ribbed tank top and loose white shorts, no visible jewellery.",
    voice: "Curious and visual, notices small details, speaks with the calm confidence of somebody sharing a place they genuinely found.",
    setting: "outdoors",
    tags: ["20s", "curious", "travel"],
    match: {
      tone: ["warm", "curious", "candid", "plain-spoken"],
      settings: ["outdoors", "travel", "deck", "beach", "garden"],
      audience: ["travel", "consumer", "wellness", "lifestyle", "creator"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "freya",
    name: "Freya",
    persona: "Remote writer, 30s",
    look: "A blonde woman in her early thirties with fair skin, loose shoulder-length hair and natural fine texture, lying on her stomach beside a quiet lotus pond and working on a slim laptop. The setting is unusual but believable, with broad lily pads, damp grass and soft overcast daylight, filmed as an unpolished phone moment.",
    wardrobe: "A white ribbed sleeveless top and relaxed neutral trousers, lightly creased from sitting outside.",
    voice: "Reflective but practical, turns an observation into a useful point without sounding rehearsed.",
    setting: "outdoors",
    tags: ["30s", "reflective", "remote work"],
    match: {
      tone: ["earnest", "calm", "plain-spoken", "curious"],
      settings: ["outdoors", "garden", "home-office", "desk", "travel"],
      audience: ["freelancer", "creator", "remote work", "wellness", "consumer"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
  {
    id: "noor",
    name: "Noor",
    persona: "Home creator, 20s",
    look: "A woman in her late twenties with medium olive skin, dark wavy hair, soft brows and an open, observant expression, standing in a small lived-in apartment kitchen by a bright window while holding a ceramic mug. The counter has an ordinary notebook, fruit and breakfast dishes, like an authentic morning phone video.",
    wardrobe: "An oversized heather-grey cotton t-shirt, relaxed and naturally wrinkled, no visible jewellery.",
    voice: "Warm and conversational, explains things simply, with a quick aside when something did not go to plan.",
    setting: "kitchen",
    tags: ["20s", "warm", "home"],
    match: {
      tone: ["warm", "plain-spoken", "empathetic", "candid"],
      settings: ["kitchen", "home", "counter", "desk", "studio"],
      audience: ["consumer", "home", "wellness", "food", "lifestyle"],
      funnel_stage: ["awareness", "consideration"],
    },
  },
];

export const presetById = (id: string) =>
  ACTOR_PRESETS.find((preset) => preset.id === id);

/**
 * The description handed to a template's `presenter` slot.
 *
 * Assembled here rather than at the call site so the preview script, the run and
 * the custom-casting endpoint all brief the model with the same sentence — the
 * portrait somebody picked has to be the person who turns up in the video.
 */
export const presetNote = (preset: ActorPreset) =>
  `${preset.look} Wearing: ${preset.wardrobe} Speaks: ${preset.voice}`;
