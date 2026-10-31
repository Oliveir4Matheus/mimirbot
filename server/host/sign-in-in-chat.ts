/**
 * The person's own line answers every sign-in card still open in their
 * conversation, as Done would: the card settles, the place the card lent them
 * goes back to the bot, and the work parked on those cards ends quietly so
 * nothing resumes it twice.
 *
 * Kept out of server/index.ts, whose size ceiling this belongs under: the
 * server owns the state, so every piece it touches arrives as a dependency.
 */
import { signInWaits, type SignInPlace } from "../../shared/sign-in-request.ts";
import type { SignInRequestCardData } from "../../shared/wire.ts";
import type { BotRecord } from "../store.ts";

/** The parts of a message this module reads. */
type CardMessage = { id: string; kind: string; signIn?: SignInRequestCardData; from?: { botId?: string } };
/** A card the person may answer, with nothing else of the message to hand back. */
type SignInCardMessage = { id: string; signIn: SignInRequestCardData };
/** The cards a parked turn is waiting on. */
type Parked = { cards?: string[]; startedAt?: number; createdAt: number };

export interface SignInInChatDeps {
  bot: (botId: string) => BotRecord | null | undefined;
  path: (threadId: string) => readonly CardMessage[];
  connectorThread: (botId: string, threadId: string) => { group?: unknown } | null | undefined;
  patchCard: (threadId: string, messageId: string, card: SignInRequestCardData) => void;
  settleHelp: (messageId: string) => string[];
  handBrowserBack: (bot: BotRecord, threadId: string) => void;
  releaseComputer: (key: string) => void;
  computerKey: (bot: BotRecord) => string;
  parked: (threadId: string) => Parked | null | undefined;
  openCards: (threadId: string, since: number) => readonly { id: string }[];
  release: (threadId: string, cardId: string, why: string) => void;
}

export interface SignInInChat {
  /** The open sign-in card this id names, when it is one the person may answer here: in a room, only the asking bot's own card. */
  message: (botId: string, threadId: string, messageId: string) => SignInCardMessage | null;
  /** The person is through with the place the card lent them: its plea goes, and the browser or computer goes back to the bot. */
  handPlaceBack: (bot: BotRecord, threadId: string, messageId: string, place: SignInPlace) => void;
  /** Answer every sign-in card still open in the conversation, and end the work parked on them. */
  answer: (botId: string, threadId: string) => void;
}

export function createSignInInChat(deps: SignInInChatDeps): SignInInChat {
  function message(botId: string, threadId: string, messageId: string): SignInCardMessage | null {
    const owner = deps.connectorThread(botId, threadId);
    if (!owner) return null;
    const found = deps.path(threadId).find((candidate) => candidate.id === messageId);
    if (owner.group && found?.from?.botId !== botId) return null;
    return found?.kind === "signin" && found.signIn ? { id: found.id, signIn: found.signIn } : null;
  }

  function handPlaceBack(bot: BotRecord, threadId: string, messageId: string, place: SignInPlace): void {
    const pleaded = deps.settleHelp(messageId);
    if (place === "browser") deps.handBrowserBack(bot, threadId);
    else for (const key of pleaded.length ? pleaded : [deps.computerKey(bot)]) deps.releaseComputer(key);
  }

  function answer(botId: string, threadId: string): void {
    const bot = deps.bot(botId);
    if (!bot) return;
    const answered: string[] = [];
    for (const open of deps.path(threadId)) {
      const card = open.signIn;
      if (open.kind !== "signin" || !card || card.stopped || !signInWaits(card)) continue;
      handPlaceBack(bot, threadId, open.id, card.place);
      deps.patchCard(threadId, open.id, { ...card, answeredInChat: true, error: undefined });
      answered.push(open.id);
    }
    const parked = deps.parked(threadId);
    const card = parked?.cards?.find((id) => answered.includes(id));
    if (!parked || !card || deps.openCards(threadId, parked.startedAt ?? parked.createdAt).some((open) => parked.cards!.includes(open.id))) return;
    deps.release(threadId, card, "The person answered in the chat");
  }

  return { message, handPlaceBack, answer };
}
