const serviceRoleKey = process.env.COMPOUND_QA_SERVICE_ROLE_KEY;
const publishableKey = process.env.COMPOUND_QA_PUBLISHABLE_KEY;
const magicWord = process.env.COMPOUND_QA_MAGIC_WORD;
const verifyCorrectWord = process.argv.includes("--verify-correct-word");

if (!serviceRoleKey) throw new Error("COMPOUND_QA_SERVICE_ROLE_KEY is required");
if (verifyCorrectWord && (!publishableKey || !magicWord)) {
  throw new Error("COMPOUND_QA_PUBLISHABLE_KEY and COMPOUND_QA_MAGIC_WORD are required for the correct-word check");
}

const supabaseUrl = "https://gojpffsrxybbpbdzzrvs.supabase.co";
const appUrl = "https://compound.krishraja.com";
const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function authUserCount() {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`, { headers: adminHeaders });
  if (!response.ok) throw new Error(`Auth user readback failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.users)) throw new Error("Auth user readback was malformed");
  return body.users.length;
}

async function requestLogin(word) {
  return await fetch(`${appUrl}/api/compound-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
    },
    body: JSON.stringify({ magicWord: word }),
  });
}

const beforeCount = await authUserCount();
const rejected = await requestLogin("definitely-not-the-magic-word");
if (rejected.status !== 401) throw new Error(`Wrong-word request returned HTTP ${rejected.status}`);

const afterCount = await authUserCount();
if (afterCount !== beforeCount) throw new Error(`Wrong-word request changed Auth users from ${beforeCount} to ${afterCount}`);
if (afterCount !== 1) throw new Error(`Expected one private Auth member, found ${afterCount}`);

console.log(`Wrong-word protection passed: HTTP 401, Auth users remained ${afterCount}.`);

if (verifyCorrectWord) {
  const accepted = await requestLogin(magicWord);
  const body = await accepted.json().catch(() => ({}));
  if (accepted.status !== 200 || typeof body.tokenHash !== "string") {
    throw new Error(`Correct-word request returned HTTP ${accepted.status} without a token hash`);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: sessionData, error: sessionError } = await client.auth.verifyOtp({
    token_hash: body.tokenHash,
    type: "email",
  });
  if (sessionError || !sessionData.session) throw new Error("The one-time token did not create a user session");

  const { data: snapshots, error: snapshotError } = await client
    .schema("compound")
    .from("daily_snapshots")
    .select("id")
    .limit(1);
  if (snapshotError || !snapshots?.length) throw new Error("The magic-word session could not read the private dashboard snapshot");

  await client.auth.signOut();
  const finalCount = await authUserCount();
  if (finalCount !== 1) throw new Error(`Correct-word login changed Auth users to ${finalCount}`);
  console.log("Correct-word protection passed: one-time session opened and read a private dashboard snapshot without email.");
}
