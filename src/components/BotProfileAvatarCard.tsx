import { ChevronDown, ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import {
  PICKABLE_STATES,
  MAUS_COLOR_LABEL,
  colorSwatch,
  MAUS_COLOR_NAMES,
  type MausMotion,
  type MausState,
} from "@/lib/mascot";
import { BOT_AVATAR_CROPS } from "../../shared/bot-avatar";
import { MASCOT_BODIES, MASCOT_BODY_IDS } from "../../shared/mascot-bodies";
import { HALLOWEEN_BODIES, HALLOWEEN_BODY_IDS } from "../../shared/halloween-bodies";
import type { BotBodyId } from "../../shared/bot-body";
import { BotAvatar, MausAvatar } from "./Avatar";
import { AvatarImageGenerator } from "./AvatarImageGenerator";
import { AvatarFraming, OrganizationAvatarIcons, RESET_MASCOT_PATCH, useAvatarImage, type AvatarPatch } from "./avatar-editing";
import { t } from "@/lib/i18n";

type AvatarImage = ReturnType<typeof useAvatarImage>;
type Motion = { kind: Exclude<MausMotion, "none">; nonce: number } | null;

export function BotProfileAvatarCard({
  bot,
  activeState,
  mascotMotion,
  onPatch,
  compact = false,
}: {
  bot: Bot;
  activeState: MausState;
  mascotMotion: Motion;
  onPatch: (patch: AvatarPatch) => void;
  compact?: boolean;
}) {
  const image = useAvatarImage(bot, onPatch);
  const { crop, uploading, generating, setSavingConnection, busy, error, generate } = image;
  const mascot = crop === "mascot";

  const preview = crop !== "mascot" && bot.avatarUrl ? (
    <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />
  ) : (
    <div className={cn("flex justify-center", compact ? "pb-4 pt-1" : "py-3")}>
      <BotAvatar
        bot={bot}
        state={activeState}
        size={compact ? 96 : 112}
        motion={mascotMotion?.kind ?? "none"}
        motionKey={mascotMotion?.nonce ?? 0}
      />
    </div>
  );

  const shapeAndExpression = (
    <>
      <PickerLabel>{t("botIdentity.shape")}</PickerLabel>
      <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-hairline/40">
        {BOT_AVATAR_CROPS.map((candidate, index) => (
          <button
            key={candidate}
            type="button"
            disabled={busy}
            aria-pressed={crop === candidate}
            onClick={() => onPatch({ avatarCrop: candidate })}
            className={cn(
              "py-1.5 text-[12.5px] disabled:opacity-50",
              index > 0 && "border-l border-hairline/40",
              crop === candidate ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/60 hover:text-ink",
            )}
          >
            {t(`botIdentity.crop.${candidate}` as never)}
          </button>
        ))}
      </div>

      {mascot && (
        <>
          <PickerLabel>{t("botIdentity.expression")}</PickerLabel>
          <div className="grid grid-cols-5 gap-2">
            {PICKABLE_STATES.map((expression) => (
              <button
                key={expression}
                type="button"
                disabled={busy}
                aria-pressed={activeState === expression}
                onClick={() => onPatch({ mascotExpression: expression })}
                className={cn(
                  "flex h-[58px] items-center justify-center rounded-xl bg-inset transition-colors hover:bg-control disabled:opacity-50",
                  activeState === expression && "ring-2 ring-accent-border",
                )}
                title={expression}
                aria-label={`Use ${expression} expression`}
              >
                <MausAvatar color={bot.color} bodyId={bot.mascotBody ?? undefined} state={expression} size={42} animated={false} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  const halloween = (
    <>
      <PickerLabel>{t("botPanel.avatar.halloween")}</PickerLabel>
      <div className="grid grid-cols-5 gap-1.5" data-halloween-bodies>
        {HALLOWEEN_BODY_IDS.map((id) => (
          <BodyButton key={id} id={id} name={HALLOWEEN_BODIES[id].name} bot={bot} busy={busy} onPatch={onPatch} />
        ))}
      </div>
    </>
  );

  const generator = (
    <AvatarImageGenerator
      botLabel={bot.title || bot.name}
      disabled={uploading}
      generating={generating}
      onGenerate={generate}
      onSavingChange={setSavingConnection}
    />
  );

  if (compact) {
    return (
      <div className="overflow-hidden rounded-xl border border-hairline/40 bg-card">
        <div className="p-4">
          {preview}
          {mascot && (
            <>
              <PickerLabel first>{t("botIdentity.body")}</PickerLabel>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" data-new-bot-bodies>
                {MASCOT_BODY_IDS.map((id) => (
                  <BodyButton key={id} id={id} name={MASCOT_BODIES[id].name} bot={bot} busy={busy} onPatch={onPatch} />
                ))}
              </div>
              <PickerLabel>{t("botIdentity.color")}</PickerLabel>
              <ColorSwatches bot={bot} busy={busy} onPatch={onPatch} size="sm" />
            </>
          )}
        </div>
        <details className="group border-t border-hairline/40" data-new-bot-avatar-more>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[13px] text-ink-secondary hover:text-ink [&::-webkit-details-marker]:hidden">
            {t("newBot.identity.moreAvatar")}
            <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => onPatch(RESET_MASCOT_PATCH)}
                className="rounded-md px-2 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50"
              >
                {t("botIdentity.resetMascot")}
              </button>
            </div>
            <OrganizationAvatarIcons busy={busy} onUpload={(file) => void image.upload(file)} />
            <UploadRow image={image} bot={bot} />
            {shapeAndExpression}
            {mascot && halloween}
            {generator}
          </div>
        </details>
        {error && <div role="alert" className="border-t border-hairline/40 px-4 py-3 text-[12px] text-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline/40 bg-card">
      <div className="flex items-center justify-between border-b border-hairline/40 px-3 py-2.5">
        <span className="rounded-lg bg-control px-3 py-1.5 text-[14px] font-medium text-ink">{t("botIdentity.avatar")}</span>
        <button
          disabled={busy}
          onClick={() => onPatch(RESET_MASCOT_PATCH)}
          className="rounded-md px-2 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50"
        >
          {t("botIdentity.resetMascot")}
        </button>
      </div>

      <div className="p-3">
        <OrganizationAvatarIcons busy={busy} onUpload={(file) => void image.upload(file)} />
        {preview}
        <UploadRow image={image} bot={bot} />

        {shapeAndExpression}

        {mascot && (
          <>
            <PickerLabel>{t("botIdentity.color")}</PickerLabel>
            <ColorSwatches bot={bot} busy={busy} onPatch={onPatch} />

            <PickerLabel>{t("botIdentity.body")}</PickerLabel>
            <div className="grid grid-cols-5 gap-1.5">
              {MASCOT_BODY_IDS.map((id) => (
                <BodyButton key={id} id={id} name={MASCOT_BODIES[id].name} bot={bot} busy={busy} onPatch={onPatch} />
              ))}
            </div>
            {halloween}
          </>
        )}

        {generator}

        {error && <div role="alert" className="mt-3 text-[12px] text-danger">{error}</div>}
      </div>
    </div>
  );
}

function PickerLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div className={cn("mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary", first ? "mt-0" : "mt-4")}>
      {children}
    </div>
  );
}

function UploadRow({ image, bot }: { image: AvatarImage; bot: Bot }) {
  const { fileRef, uploading, busy, upload, removeImage } = image;
  return (
    <>
      <div className="mt-2 flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-control px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {t("botIdentity.uploadImage")}
        </button>
        {bot.avatarUrl && (
          <button
            type="button"
            onClick={removeImage}
            disabled={busy}
            aria-label={t("botIdentity.removeAvatar")}
            title={t("botIdentity.removeImage")}
            className="flex size-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-secondary">{t("botIdentity.imageTypes")}</div>
    </>
  );
}

function ColorSwatches({ bot, busy, onPatch, size = "md" }: { bot: Bot; busy: boolean; onPatch: (patch: AvatarPatch) => void; size?: "sm" | "md" }) {
  return (
    <div className={cn("flex flex-wrap", size === "sm" ? "gap-2" : "gap-2.5")}>
      {MAUS_COLOR_NAMES.map((color) => (
        <button
          key={color}
          type="button"
          disabled={busy}
          aria-pressed={bot.color === color}
          onClick={() => onPatch({ color })}
          className={cn(
            "rounded-full border-2 border-transparent transition-transform hover:scale-110 disabled:opacity-50",
            size === "sm" ? "size-7" : "size-10",
            bot.color === color && "ring-2 ring-accent-border ring-offset-2 ring-offset-card",
          )}
          style={{ background: colorSwatch(color) }}
          title={t(MAUS_COLOR_LABEL[color])}
          aria-label={`Use ${color} mascot color`}
        />
      ))}
    </div>
  );
}

function BodyButton({ id, name, bot, busy, onPatch }: {
  id: BotBodyId;
  name: string;
  bot: Bot;
  busy: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const selected = (bot.mascotBody ?? "cursor") === id;
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={selected}
      aria-label={`Use the ${name} body`}
      title={name}
      onClick={() => onPatch({ mascotBody: id })}
      className={cn(
        "flex items-center justify-center rounded-lg py-1.5 disabled:opacity-50",
        selected ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/60",
      )}
    >
      <MausAvatar color={bot.color} bodyId={id} size={34} animated={false} trackPointer={false} />
    </button>
  );
}
