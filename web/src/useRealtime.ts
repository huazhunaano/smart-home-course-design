import { useEffect, useRef, useState } from "react";

export function useRealtime(onMessage: (msg: any) => void): boolean {
  const [online, setOnline] = useState(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: number | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/state`);
      ws.onopen = () => setOnline(true);
      ws.onclose = () => {
        setOnline(false);
        if (!stopped) timer = window.setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data));
        } catch {
          /* ignore malformed frame */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return online;
}
