"use client";
import { emailOTPClient, magicLinkClient, phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [emailOTPClient(), magicLinkClient(), phoneNumberClient()],
});
