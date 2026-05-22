# N8N patch — Podchaser OAuth token grant

**Target workflow:** `Nova | Mindmaker OS | Closed-Loop PR Engine`
(id `hCbvRXoGWaqG1Znx`)

## Why

The current Podchaser credential (`RJZ9FasldBWalQZY`, type `httpHeaderAuth`)
stores a manually-pasted access token. Podchaser access tokens **expire**,
so the `Podchaser: Search Podcasts` node started returning

```json
{ "errors": [{ "message": "Invalid authorization request" }],
  "data":   { "podcasts": null } }
```

on 2026-05-20 (execution id `5585`). Yesterday's successful runs were lucky
— they hit the API before the token rotated out. **Pasting a fresh token
will revive things until it expires again** (typically within 24h).

The durable fix: have the workflow fetch a short-lived access token on
every run via the OAuth client-credentials grant, then use that token in
the Authorization header for both Podchaser nodes.

## Pre-requisites (one-time)

You need the Podchaser **client_id** and **client_secret** from
<https://api.podchaser.com> → API Keys.

In N8N → Credentials, create two new entries:

| Name                       | Type                | Value                                          |
| -------------------------- | ------------------- | ---------------------------------------------- |
| `Podchaser Client ID`      | `httpHeaderAuth`    | name=`x-podchaser-client-id` value=`<id>`      |
| `Podchaser Client Secret`  | `httpHeaderAuth`    | name=`x-podchaser-client-secret` value=`<sec>` |

(We're abusing httpHeaderAuth as a secret store — the actual `Get Podchaser
Token` node reads `$credentials` from a Function node, never sends those
two headers anywhere.)

Alternatively (simpler): create one **`Podchaser API`** credential of type
`genericCredentialType` storing both `client_id` and `client_secret` and
read with `{{ $credentials.client_id }}` from the function node.

## Patch — apply in N8N UI

**Insert a `Get Podchaser Token` HTTP Request node** immediately upstream of
`Podchaser: Search Podcasts`:

```json
{
  "name": "Get Podchaser Token",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://api.podchaser.com/oauth/token",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ grant_type: 'CLIENT_CREDENTIALS', client_id: $env.PODCHASER_CLIENT_ID, client_secret: $env.PODCHASER_CLIENT_SECRET }) }}",
    "options": {
      "response": {
        "response": { "responseFormat": "json", "neverError": false }
      }
    },
    "authentication": "none"
  }
}
```

If you don't have N8N env vars set up, swap `$env.PODCHASER_CLIENT_ID` /
`$env.PODCHASER_CLIENT_SECRET` for literal values pulled from your N8N
credentials store. Do **not** commit the secrets to this repo.

**Rewire the existing Podchaser nodes** to use the fetched token. On both
`Podchaser: Search Podcasts` and `Podchaser: Latest Episode`:

1. Set `authentication` → `None`.
2. Disconnect the old `Podchaser` httpHeaderAuth credential.
3. Add a header parameter:
   - Name: `Authorization`
   - Value: `={{ "Bearer " + $('Get Podchaser Token').item.json.access_token }}`
4. Add a header parameter:
   - Name: `Content-Type`
   - Value: `application/json`

**Connection order:**

```
Route Pipeline ──► (existing) ──► Get Podchaser Token ──► Podchaser: Search Podcasts
                                                       └► Map Podchaser Search ──► …
```

`Get Podchaser Token` becomes the **only** caller of `/oauth/token`; both
Podchaser GraphQL nodes share the access_token from its output.

## Test

After save:

```bash
# Trigger one P1 run manually (Mondays branch — Podchaser path).
curl -X POST \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://krishraja10101.app.n8n.cloud/api/v1/workflows/hCbvRXoGWaqG1Znx/execute"

# Inspect the latest execution.
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://krishraja10101.app.n8n.cloud/api/v1/executions?workflowId=hCbvRXoGWaqG1Znx&limit=1"
```

The `Podchaser: Search Podcasts` node output should now contain
`data.podcasts.data` as an array of podcast objects (`id`, `title`,
`author`, `webUrl`, `numberOfEpisodes`, `latestEpisodeDate`).

If you still see `"Invalid authorization request"`, the client_id/secret
pair is wrong — re-generate them in the Podchaser dashboard.

## Roll-back

Re-attach the original `Podchaser` httpHeaderAuth credential to both nodes,
delete the `Get Podchaser Token` node, and paste a fresh access_token into
the credential. The workflow returns to the brittle manual-token state.
