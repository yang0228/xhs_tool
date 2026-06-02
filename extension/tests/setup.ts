import "@testing-library/jest-dom/vitest";
import { chrome } from "./mocks/chrome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = chrome;
