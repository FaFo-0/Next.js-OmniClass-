// Seed a curated starter library into a tenant for testing and early use.
//
// Rights: public-domain classics (Aesop, Grimm) and clearly-labelled original
// academy material written for learners. Run idempotently against a tenant:
//   npx convex run seedLibrary:seedLibrary '{"organizationId":"org_..."}' --prod
// Each work carries license + attribution so the reader can credit the source.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { splitMarkdownIntoUnits } from "./lib/libraryContent";

interface WorkSeed {
  externalId: string;
  title: string;
  kind: "book" | "article" | "story" | "dialog" | "transcript";
  levelCEFR?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  topicTags: string[];
  description: string;
  author?: string;
  license: string;
  attribution: string;
  contentMarkdown: string;
}

const WORKS: WorkSeed[] = [
  // ── Books ────────────────────────────────────────────────────────
  {
    externalId: "aesops-fables",
    title: "Aesop's Fables",
    kind: "book",
    levelCEFR: "A2",
    topicTags: ["culture", "daily-life"],
    description:
      "Eight of Aesop's best-known fables, retold in simple English. Each one ends with a short moral.",
    author: "Aesop",
    license: "Public domain (ancient work)",
    attribution: "Aesop (c. 620–564 BCE); retold in simple English for learners",
    contentMarkdown: `## The Tortoise and the Hare

A hare laughed at a tortoise for being slow. "Let us race," said the tortoise. "I will beat you."

The hare ran fast and soon was far ahead. He was sure he would win, so he stopped to rest and fell asleep.

The tortoise walked slowly but never stopped. Step by step, he passed the sleeping hare and reached the end first.

Slow and steady wins the race.

## The Fox and the Grapes

A hungry fox saw a bunch of grapes hanging high on a vine. He jumped again and again to reach them, but they were too high.

At last he gave up. "Those grapes are sour anyway," he said, and walked away.

It is easy to dislike what we cannot have.

## The Lion and the Mouse

A lion was asleep when a little mouse ran across his nose. The lion woke and caught the mouse.

"Please let me go," begged the mouse. "One day I will help you."

The lion laughed, but he let the mouse go.

Later the lion was caught in a hunter's net. The little mouse heard him roar, came quickly, and chewed through the ropes until the lion was free.

Even the small can help the great.

## The Boy Who Cried Wolf

A shepherd boy was bored. To amuse himself, he shouted, "Wolf! Wolf!" The villagers ran to help, but there was no wolf. The boy laughed at them.

He did this again the next day, and again the villagers came running — and again there was no wolf.

Then a real wolf came. "Wolf! Wolf!" cried the boy, but this time nobody came. The wolf attacked the flock.

Nobody believes a liar, even when he tells the truth.

## The Ant and the Grasshopper

All summer, an ant worked hard, carrying food to her nest. A grasshopper sat in the sun, singing and playing.

"Why work so hard?" asked the grasshopper. "Come and enjoy the summer."

The ant kept working. "Winter is coming," she said. "I am getting ready."

When winter came, the grasshopper was cold and hungry, but the ant was warm and well fed.

Prepare today for the needs of tomorrow.

## The Crow and the Pitcher

A thirsty crow found a pitcher with a little water at the bottom. She could not reach it with her beak.

The crow picked up small stones, one by one, and dropped them into the pitcher. The water rose higher and higher until she could drink.

Little by little does the trick.

## The Goose That Laid the Golden Eggs

A farmer had a goose that laid one golden egg every day. He sold the eggs and grew rich.

But the farmer grew greedy. "If the goose lays golden eggs," he thought, "there must be a treasure inside her."

He killed the goose and opened it, but he found nothing. Now he had no golden eggs at all.

Those who want more may lose all they have.

## The North Wind and the Sun

The North Wind and the Sun argued about which of them was stronger.

"See that traveller below," said the Sun. "Whoever makes him take off his coat is the stronger."

The North Wind blew as hard as he could. The harder he blew, the tighter the traveller held his coat.

Then the Sun shone gently. The traveller grew warm and took off his coat himself.

Kindness is stronger than force.`,
  },

  {
    externalId: "grimms-household-tales",
    title: "Grimm's Household Tales — Selected",
    kind: "book",
    levelCEFR: "B1",
    topicTags: ["culture"],
    description:
      "Five well-known fairy tales from the Brothers Grimm, told in clear English for learners.",
    author: "The Brothers Grimm",
    license: "Public domain (19th-century translation)",
    attribution: "Jacob and Wilhelm Grimm; retold in clear English for learners",
    contentMarkdown: `## The Frog Prince

A princess was playing with her golden ball when it fell into a deep well. She began to cry.

"Do not cry," said a voice. It was a frog. "I will bring back your ball if you promise to let me be your friend and eat from your plate."

The princess promised, and the frog brought back the ball. But when he asked to come inside, the princess shut the door.

The frog knocked until her father, the king, learned what had happened. "A promise must be kept," said the king. So the princess let the frog in.

At last, when the princess treated the frog with kindness, he changed into a handsome prince, and they lived happily together.

## The Bremen Town Musicians

An old donkey, who could no longer work, decided to go to Bremen to become a musician. On the way he met a dog, a cat, and a rooster, all too old for their work. They joined him.

At night they came to a house where robbers sat around a table full of food. The animals stood on each other's backs and made a great noise together. The robbers, thinking a monster had come, ran away.

The four friends found a happy home there and never needed to go to Bremen at all.

## The Elves and the Shoemaker

A poor shoemaker had only enough leather for one pair of shoes. That night, he cut out the leather and went to bed.

In the morning he found the shoes already made, perfectly stitched. A customer bought them, and with the money the shoemaker bought more leather.

Every night the shoes made themselves. One night the shoemaker and his wife stayed awake and saw two little elves doing the work.

To thank them, the wife sewed warm clothes and the shoemaker made tiny shoes for the elves. When the elves saw the gifts, they danced with joy and never returned — but the shoemaker's good fortune stayed with him always.

## Little Red Riding Hood

A girl called Little Red Riding Hood went to visit her grandmother. On the way she met a wolf, who asked where she was going.

"To my grandmother's house," she said.

The wolf ran ahead, reached the house first, and hid the grandmother in a cupboard. He put on her clothes and got into her bed.

When Little Red Riding Hood arrived, she saw the wolf and cried out. A hunter who was passing heard her and came in. He saved the grandmother, and Little Red Riding Hood learned never to talk to strangers.

## The Fisherman and His Wife

A fisherman caught a magic fish that could grant wishes. His wife asked for a cottage, then a castle, then to be a king, then an emperor, and then the pope — and the fish granted each wish.

At last she wished to be like the sun itself. "What would you wish for now?" asked the fisherman, weary.

When the fish heard this final wish, it sent them back to their old, small hut by the sea.

Those who are never satisfied may end with nothing.`,
  },

  // ── Original articles ───────────────────────────────────────────
  {
    externalId: "a-morning-before-work",
    title: "A Morning Before Work",
    kind: "article",
    levelCEFR: "A1",
    topicTags: ["daily-life"],
    description: "A short reading about an ordinary weekday morning.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `Every morning, I get up at seven o'clock. First, I brush my teeth and wash my face. Then I get dressed.

I have breakfast with my family. I eat bread, cheese, and I drink a cup of tea. I like tea more than coffee.

After breakfast, I take the bus to work. The bus is usually full, so I stand near the door. The ride takes about twenty minutes.

I start work at nine o'clock. Before work, I check my messages on my phone. I always arrive a little early.

I like the morning. It is a quiet time before the busy day begins.`,
  },

  {
    externalId: "my-weekend",
    title: "My Weekend",
    kind: "article",
    levelCEFR: "A1",
    topicTags: ["daily-life", "sport"],
    description: "How one person spends Saturday and Sunday.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `On Saturday, I do not work. I sleep until nine o'clock. I feel good because I can rest.

In the morning, I go to the market. I buy fruit and vegetables for the week. I like fresh food.

In the afternoon, I play football with my friends in the park. We play for two hours. Sometimes we win, sometimes we lose.

On Sunday, I stay at home. I read a book and watch a film. In the evening, I call my mother. She lives in another city.

I cook dinner on Sunday night. I usually make rice and chicken. Then I go to bed early, because Monday is a work day.`,
  },

  {
    externalId: "at-the-airport",
    title: "At the Airport",
    kind: "article",
    levelCEFR: "A2",
    topicTags: ["travel"],
    description: "A step-by-step story of checking in for a flight.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `Last month, I flew to another country for the first time. I was a little nervous, but everything was easy.

I arrived at the airport three hours before my flight. First, I found the check-in desk. The woman there asked for my passport and gave me my boarding pass.

Then I went through security. I put my bag, my shoes, and my phone in a box. The box moved through a machine. A man asked me to open my bag, but it was fine.

After security, I waited in the departure hall. I bought a sandwich and some water. I watched the planes through the big window.

When they called my flight number, I walked to the gate. I showed my boarding pass and got on the plane. I found my seat next to the window.

The plane took off, and I looked down at the city. It looked very small. The flight took four hours, and I slept for half of it.`,
  },

  {
    externalId: "a-visit-to-the-doctor",
    title: "A Visit to the Doctor",
    kind: "article",
    levelCEFR: "A2",
    topicTags: ["daily-life"],
    description: "A simple story about seeing a doctor for the first time.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `I had a bad headache for three days, so I decided to see a doctor.

I called the clinic in the morning and made an appointment for two o'clock. I arrived fifteen minutes early and gave my name to the receptionist.

I waited for about ten minutes. Then the doctor called me into her room. She asked me many questions: "Where does it hurt? When did it start? Do you sleep well?"

She checked my temperature and looked into my eyes and throat. "It is not serious," she said. "You are tired and you drink too little water."

She told me to rest and to drink more water every day. She did not give me strong medicine, only simple tablets for the pain.

I thanked her and went to the pharmacy. Now I drink a glass of water every morning, and I feel much better.`,
  },

  {
    externalId: "the-history-of-tea",
    title: "The History of Tea",
    kind: "article",
    levelCEFR: "B1",
    topicTags: ["culture", "daily-life"],
    description: "How tea travelled from China to the rest of the world.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `Tea is one of the most popular drinks in the world, but its history is long and surprising.

According to legend, tea was discovered in China almost five thousand years ago. The story says that the Emperor Shen Nong was boiling water when some leaves fell into his pot. He tasted the drink and found it refreshing.

For many centuries, tea stayed mostly in China and nearby countries. It was used as a medicine before it became a daily drink. Buddhist monks drank tea to stay awake during long periods of meditation.

Tea reached Europe in the seventeenth century. At first it was very expensive, and only rich people could buy it. In Britain, tea slowly became a national habit, and the famous "afternoon tea" began in the nineteenth century.

Today, tea is grown in many countries, including India, Sri Lanka, Kenya, and Turkey. People drink it in different ways: with milk and sugar, with lemon, or with nothing at all.

Tea is more than a drink. In many cultures, offering a cup of tea is a way to welcome a guest and to show friendship.`,
  },

  {
    externalId: "why-we-sleep",
    title: "Why We Sleep",
    kind: "article",
    levelCEFR: "B2",
    topicTags: ["science"],
    description: "What science tells us about the importance of sleep.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `We spend about a third of our lives asleep, yet for a long time scientists did not fully understand why. Today, research shows that sleep is essential for almost every part of our health.

While we sleep, the brain is far from inactive. One important job it performs is memory consolidation: it strengthens the things we learned during the day and moves them into long-term storage. This is why a good night's sleep before an exam is often more useful than a final hour of study.

Sleep also helps the body repair itself. During deep sleep, the body releases hormones that help grow and repair tissue. The immune system works harder while we rest, which is why people who sleep too little catch colds more often.

Modern life often works against sleep. Bright screens, caffeine, and irregular schedules can make it hard to fall asleep. Experts recommend a regular bedtime, a dark and cool room, and avoiding screens for an hour before bed.

The message from science is clear: sleep is not wasted time. It is an active process that keeps our minds sharp and our bodies strong.`,
  },

  // ── Original story ──────────────────────────────────────────────
  {
    externalId: "the-lost-wallet",
    title: "The Lost Wallet",
    kind: "story",
    levelCEFR: "A2",
    topicTags: ["daily-life"],
    description: "A short story about honesty and a small act of kindness.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `Omar was walking home from work when he saw a wallet on the ground. He opened it. Inside there was money, some cards, and a photo of an old man with his grandchildren.

Omar looked at the cards. He found a phone number and called it.

"Hello?" said an old man's voice.

"Did you lose a wallet?" asked Omar.

"Yes! I have looked everywhere for it," the man said, almost crying.

They met at a café near the station. The old man opened the wallet and checked everything. The money was all there.

"I can't thank you enough," said the old man. "This money is for my granddaughter's school."

He wanted to give Omar a reward, but Omar said no. "Just do something kind for another person," he said.

A week later, Omar lost his own bag on the bus. A young woman found it and returned it to him, with everything inside.

Small acts of kindness have a way of coming back.`,
  },

  // ── Dialogues ───────────────────────────────────────────────────
  {
    externalId: "ordering-at-a-cafe",
    title: "Ordering at a Café",
    kind: "dialog",
    levelCEFR: "A1",
    topicTags: ["daily-life"],
    description: "A simple dialogue at a café. Useful phrases for everyday life.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `**Waiter:** Good afternoon! Welcome. Please, sit here.

**Customer:** Thank you. Can I see the menu, please?

**Waiter:** Of course. Here you are. Would you like something to drink first?

**Customer:** Yes, a glass of water, please.

**Waiter:** Certainly. And are you ready to order?

**Customer:** Yes. I would like a chicken sandwich and a small salad.

**Waiter:** Anything else?

**Customer:** A cup of tea with lemon, please.

**Waiter:** Great. One chicken sandwich, a small salad, and a tea with lemon. Is that all?

**Customer:** Yes, that's all. Thank you.

**Waiter:** I'll bring it soon.`,
  },

  {
    externalId: "checking-into-a-hotel",
    title: "Checking into a Hotel",
    kind: "dialog",
    levelCEFR: "A2",
    topicTags: ["travel"],
    description: "A dialogue at a hotel reception desk.",
    author: "Omnica English",
    license: "Original academy material",
    attribution: "Written for Omnica English",
    contentMarkdown: `**Receptionist:** Good evening. How can I help you?

**Guest:** Good evening. I have a reservation. My name is Karim Aziz.

**Receptionist:** One moment, please... Yes, Mr. Aziz. A single room for three nights. Is that correct?

**Guest:** Yes, that's right.

**Receptionist:** May I see your passport, please?

**Guest:** Here you are.

**Receptionist:** Thank you. Could you fill in this form? Name, address, and a signature.

**Guest:** Sure. Do you have Wi-Fi in the rooms?

**Receptionist:** Yes, the password is on the card. Your room is on the fourth floor, number 412.

**Guest:** Great. What time is breakfast?

**Receptionist:** Breakfast is from seven to ten, in the restaurant on the first floor.

**Guest:** Thank you very much.

**Receptionist:** You're welcome. Enjoy your stay!`,
  },
];

export const seedLibrary = internalMutation({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }): Promise<{ created: number; skipped: number }> => {
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;

    for (const w of WORKS) {
      const existing = await ctx.db
        .query("libraryWorks")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", organizationId).eq("externalId", w.externalId)
        )
        .first();
      if (existing) {
        skipped++;
        continue;
      }

      const workId = await ctx.db.insert("libraryWorks", {
        organizationId,
        externalId: w.externalId,
        title: w.title,
        description: w.description,
        author: w.author,
        kind: w.kind,
        levelCEFR: w.levelCEFR,
        topicTags: w.topicTags,
        license: w.license,
        attribution: w.attribution,
        uploadedBy: "seed-library",
        isPublished: true,
        createdAt: now,
      });

      const units = splitMarkdownIntoUnits(w.contentMarkdown, w.title);
      let position = 0;
      for (const u of units) {
        if (!u.contentMarkdown) continue;
        await ctx.db.insert("libraryUnits", {
          organizationId,
          workId,
          externalId: `${w.externalId}-unit-${position}`,
          position,
          title: u.title,
          contentMarkdown: u.contentMarkdown,
          estimatedReadMinutes: u.estimatedReadMinutes,
          createdAt: now,
        });
        position++;
      }
      created++;
    }

    return { created, skipped };
  },
});
