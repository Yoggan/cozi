// oxlint-disable typescript/no-unsafe-call -- bun:test no está en los types del proyecto Convex.
import { expect, test } from "bun:test";

import { isBusinessEmail } from "./email";

test("personal providers are not a business signal", () => {
  expect(isBusinessEmail("sergio@gmail.com")).toBe(false);
  expect(isBusinessEmail("sergio@hotmail.com.mx")).toBe(false);
  expect(isBusinessEmail("sergio@proton.me")).toBe(false);
  expect(isBusinessEmail("sergio@prodigy.net.mx")).toBe(false);
});

test("institutions are not a business signal", () => {
  expect(isBusinessEmail("alumno@utez.edu.mx")).toBe(false);
  expect(isBusinessEmail("empleado@hacienda.gob.mx")).toBe(false);
  expect(isBusinessEmail("soldado@ejercito.mil")).toBe(false);
});

test("custom domains are a business signal", () => {
  expect(isBusinessEmail("hola@cafecentral.mx")).toBe(true);
  expect(isBusinessEmail("Hola@CafeCentral.MX")).toBe(true);
});

test("missing or malformed email is not a business signal", () => {
  expect(isBusinessEmail(undefined)).toBe(false);
  expect(isBusinessEmail("")).toBe(false);
  expect(isBusinessEmail("sin-arroba")).toBe(false);
});
