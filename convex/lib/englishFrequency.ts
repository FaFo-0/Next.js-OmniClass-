/**
 * English closed-class words: articles, determiners, pronouns, prepositions,
 * conjunctions, auxiliaries, modals, basic adverbs, numbers and contractions.
 *
 * Preparation skips these on purpose. Their dictionary meaning is already the
 * contextual one — "the" in chapter three means what it means everywhere — so a
 * paid contextual entry buys nothing and the reader's on-demand lookup answers
 * them instantly. Content words ("bank", "river", "money") are never skipped:
 * those are the words a learner actually taps.
 */
const CLOSED_CLASS = `
a an the this that these those some any no every each all both either neither
another such much many few little more most less least enough several other
i you he she it we they me him her us them my your his its our their mine yours
hers ours theirs myself yourself himself herself itself ourselves yourselves
themselves who whom whose which what someone something anyone anything everyone
everything nobody nothing somebody anybody everybody none
at by for from in into of on onto to with without about above across after
against along among around before behind below beneath beside between beyond
during except inside near off out outside over past since through throughout
till toward towards under until up upon via within
and but or nor so yet because although though if unless while whereas whether
than as
be am is are was were been being have has had having do does did done doing
will would shall should can could may might must
not yes very too also just only even still already always never often sometimes
usually again here there now then when where why how soon ever
one two three four five six seven eight nine ten
don't doesn't didn't can't won't isn't aren't wasn't weren't i'm i've i'll i'd
it's that's there's let's we're they're you're he's she's you'll we'll they'll
you've we've they've
`;
export const FREQUENT_WORDS: ReadonlySet<string> = new Set(CLOSED_CLASS.split(/\s+/).filter(Boolean));
export function isFrequentWord(word: string): boolean {
  return FREQUENT_WORDS.has(word.toLowerCase());
}
