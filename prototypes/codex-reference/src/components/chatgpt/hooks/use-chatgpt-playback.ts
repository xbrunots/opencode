"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CHATGPT_PLAYBACK_TIMING } from "../constants/chatgpt";
import type {
  ChatgptPlayback,
  ChatgptPlaybackPhase,
  ChatgptStoryMessage,
} from "../types/chatgpt";

const WHITESPACE_PATTERN = /(\s+)/;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const prefersReducedMotion = () =>
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

const idsOf = (script: readonly ChatgptStoryMessage[]) =>
  new Set(script.map((item) => item.id));

export const useChatgptPlayback = (
  script: readonly ChatgptStoryMessage[]
): ChatgptPlayback => {
  const [messages, setMessages] = useState<ChatgptStoryMessage[]>(() => [
    ...script,
  ]);
  const [completeIds, setCompleteIds] = useState<ReadonlySet<string>>(() =>
    idsOf(script)
  );
  const [phase, setPhase] = useState<ChatgptPlaybackPhase>({ status: "idle" });
  const phaseRef = useRef(phase);
  const enter = useCallback((next: ChatgptPlaybackPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const setThinking = useCallback(
    (thinking: boolean) => {
      const current = phaseRef.current;
      if (current.status === "playing") {
        enter({ ...current, thinking });
      }
    },
    [enter]
  );
  const runRef = useRef(0);

  const markComplete = useCallback((id: string) => {
    setCompleteIds((current) => new Set(current).add(id));
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    setMessages([...script]);
    setCompleteIds(idsOf(script));
    enter({ status: "idle" });
  }, [enter, script]);

  const playTurn = useCallback(
    async (message: ChatgptStoryMessage, alive: () => boolean) => {
      const reduced = prefersReducedMotion();
      const delay = (ms: number) =>
        wait(reduced ? Math.min(ms, CHATGPT_PLAYBACK_TIMING.reducedMaxMs) : ms);

      if (message.from === "user") {
        setMessages((current) => [...current, message]);
        markComplete(message.id);
        await delay(CHATGPT_PLAYBACK_TIMING.afterUserMs);
        return;
      }

      setThinking(true);
      await delay(
        message.reasoning
          ? CHATGPT_PLAYBACK_TIMING.thinkingWithReasoningMs
          : CHATGPT_PLAYBACK_TIMING.thinkingMs
      );
      if (!alive()) {
        return;
      }
      setThinking(false);

      if (reduced) {
        setMessages((current) => [...current, message]);
        markComplete(message.id);
        await delay(CHATGPT_PLAYBACK_TIMING.afterInstantMs);
        return;
      }

      setMessages((current) => [...current, { ...message, text: "" }]);
      let text = "";
      for (const token of message.text.split(WHITESPACE_PATTERN)) {
        if (!alive()) {
          return;
        }
        text += token;
        const snapshot = text;
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, text: snapshot } : item
          )
        );
        await delay(CHATGPT_PLAYBACK_TIMING.tokenMs);
      }
      if (!alive()) {
        return;
      }
      markComplete(message.id);
      await delay(CHATGPT_PLAYBACK_TIMING.afterAssistantMs);
    },
    [markComplete, setThinking]
  );

  const play = useCallback(async () => {
    const run = runRef.current + 1;
    runRef.current = run;
    const alive = () => runRef.current === run;

    enter({ status: "playing", source: "script", thinking: false });
    setMessages([]);
    setCompleteIds(new Set());

    for (const message of script) {
      if (!alive()) {
        return;
      }
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- turns must play one after another
      await playTurn(message, alive);
    }

    if (alive()) {
      enter({ status: "idle" });
    }
  }, [enter, playTurn, script]);

  const send = useCallback(
    async (text: string, reply: string) => {
      const current = phaseRef.current;
      if (current.status === "playing" && current.source === "send") {
        return;
      }
      const run = runRef.current + 1;
      runRef.current = run;
      const alive = () => runRef.current === run;
      const now = Date.now();

      enter({ status: "playing", source: "send", thinking: false });
      await playTurn({ from: "user", id: `user-${now}`, text }, alive);
      if (!alive()) {
        return;
      }
      await playTurn(
        { from: "assistant", id: `assistant-${now}`, text: reply },
        alive
      );
      if (alive()) {
        enter({ status: "idle" });
      }
    },
    [enter, playTurn]
  );

  useEffect(
    () => () => {
      runRef.current += 1;
    },
    []
  );

  const playing = phase.status === "playing";
  const thinking = phase.status === "playing" && phase.thinking;

  return { completeIds, messages, play, playing, send, stop, thinking };
};
