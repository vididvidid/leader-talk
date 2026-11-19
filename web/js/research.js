// Research behind every check. Each move and issue in engine.js points to one of these,
// so the app can always answer "why is this weak?" with a source you can look up.
export const PRINCIPLES = {
  grice_quality: {
    name: "Say only what you have evidence for",
    source: "H. P. Grice (1975), \"Logic and Conversation\" (Maxim of Quality). Grice was an Oxford philosopher of language.",
    idea: "Listeners assume you believe what you say and have evidence for it. Bluffing or over-claiming breaks that trust. Saying plainly \"I don't know\" keeps it.",
  },
  grice_quantity: {
    name: "Give as much as needed, no more",
    source: "H. P. Grice (1975), \"Logic and Conversation\" (Maxim of Quantity).",
    idea: "Too little and the listener has to dig (\"Pardon?\"). Too much and the point gets lost. In speech, 2-4 sentences is usually right.",
  },
  grice_relation: {
    name: "Stay relevant",
    source: "H. P. Grice (1975), \"Logic and Conversation\" (Maxim of Relation).",
    idea: "Your reply must connect to what was actually said. A reply that sounds polite but ignores the topic is not an answer.",
  },
  grice_manner: {
    name: "Be clear and orderly",
    source: "H. P. Grice (1975), \"Logic and Conversation\" (Maxim of Manner).",
    idea: "Avoid obscurity and ambiguity, and be orderly. Double negatives and vague words force the listener to decode you.",
  },
  powerless: {
    name: "Avoid \"powerless\" speech",
    source: "Erickson, Lind, Johnson & O'Barr (1978), \"Speech style and impression formation in a court setting\", Journal of Experimental Social Psychology (Duke University courtroom studies); R. Lakoff (1975), Language and Woman's Place.",
    idea: "Hedges (maybe, kind of), needless apologies, tag questions (\"..., right?\"), fillers and intensifiers made witnesses seem less credible and less competent, even when what they said was identical.",
  },
  minto: {
    name: "Main point first",
    source: "B. Minto (1987), The Pyramid Principle; \"Bottom Line Up Front\" in US Army writing guidance (AR 25-50).",
    idea: "Busy listeners decide in the first sentence whether to pay attention. Lead with the fact or the ask; details come after.",
  },
  politeness: {
    name: "Protect the other person's face",
    source: "P. Brown & S. Levinson (1987), Politeness: Some Universals in Language Usage, Cambridge University Press; R. Lakoff (1973), \"The Logic of Politeness\".",
    idea: "Disagreeing, refusing and correcting threaten the other person's dignity (\"face\"). Skilled speakers soften these acts: acknowledge them, ask instead of order, and give options. You stay firm on the content and gentle on the person.",
  },
  gibb: {
    name: "Don't trigger defensiveness",
    source: "J. R. Gibb (1961), \"Defensive Communication\", Journal of Communication.",
    idea: "Judging, controlling, acting superior (\"calm down\", \"as I said\") or acting dogmatic makes people defend themselves instead of listening. Describing the problem and staying open (\"Which part did I get wrong?\") keeps them thinking.",
  },
  nvc: {
    name: "Observation, not evaluation",
    source: "M. Rosenberg (2003), Nonviolent Communication.",
    idea: "\"3 of 10 accounts couldn't log in\" is an observation and hard to argue with. \"That's a bad idea\" is an evaluation and invites a fight. Lead with what you saw.",
  },
  psych_safety: {
    name: "Asking questions is a strength",
    source: "A. Edmondson (1999), \"Psychological Safety and Learning Behavior in Work Teams\", Administrative Science Quarterly (Harvard).",
    idea: "Teams that ask questions and admit gaps learn and perform better. Faking agreement (\"makes sense\") hides problems until they become expensive.",
  },
  active_listening: {
    name: "Reflect back what you heard",
    source: "C. Rogers & R. Farson (1957), \"Active Listening\", University of Chicago.",
    idea: "Saying back what you understood proves you listened, corrects misunderstandings early, and makes the other person feel heard.",
  },
  implementation: {
    name: "Specific commitments: what + when",
    source: "P. Gollwitzer (1999), \"Implementation Intentions\", American Psychologist.",
    idea: "Plans that name a concrete action and a time are far more likely to be carried out, and they sound far more believable to the listener.",
  },
  because: {
    name: "Give a reason",
    source: "E. Langer, A. Blank & B. Chanowitz (1978), \"The mindlessness of ostensibly thoughtful action\" (Harvard).",
    idea: "Requests that include a reason (\"because...\") got much more agreement. People expect a why, so give it.",
  },
  register: {
    name: "Match the register",
    source: "M. A. K. Halliday (1978), Language as Social Semiotic (tenor of discourse).",
    idea: "Every situation has a level of formality. Too casual sounds careless; too stiff (\"Respected sir, kindly...\") sounds subservient or outdated.",
  },
  usage: {
    name: "International standard usage",
    source: "Usage note. These forms are widely understood in India, but they confuse or sound odd to international colleagues.",
    idea: "Global professional English favours short, plain, standard forms. Small slips make listeners notice your English instead of your point.",
  },
  ngram: {
    name: "Phrasing that standard English uses",
    source: "Counting method: Bergsma, Lin & Goebel (2009), \"Web-scale N-gram models for lexical disambiguation\" (IJCAI). Counts from WikiText-103 (Merity et al., 2016; about 83 million words of Wikipedia text after cleaning, CC BY-SA).",
    idea: "For words people often mix up (a/the, in/on/at, about, back, up...), the app compares how often each version appears with the same neighbouring words. If the alternative is far more common, your version probably sounds unusual. This is counting, not AI.",
  },
  spelling: {
    name: "Spelling",
    source: "P. Norvig (2007), \"How to Write a Spelling Corrector\" (edit-distance method), with a frequency-ranked dictionary.",
    idea: "Small typos make readers notice the English instead of your point. The app suggests the most common real word that is one or two letter changes away.",
  },
  plain_language: {
    name: "Plain language",
    source: "R. Flesch (1948), \"A new readability yardstick\", Journal of Applied Psychology.",
    idea: "Shorter sentences and shorter words are understood faster. Readability can be measured with a formula.",
  },
};
