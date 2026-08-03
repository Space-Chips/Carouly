import { Adapter, FacebookCredentials, composeCaption, readJson } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Facebook Page multi-photo post.
 *
 * Photos are uploaded unpublished first, then attached to a single feed post
 * so they render as one swipeable album rather than N separate posts.
 * Needs a Page access token with pages_manage_posts.
 */
export const facebook: Adapter<FacebookCredentials> = {
  platform: "facebook",
  label: "Facebook Page",
  docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
  fields: [
    { key: "pageId", label: "Facebook Page ID" },
    { key: "accessToken", label: "Page access token", secret: true },
  ],

  async publish(credentials, payload) {
    const { pageId, accessToken } = credentials;
    const mediaIds: string[] = [];

    for (const imageUrl of payload.imageUrls) {
      const response = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: imageUrl,
          published: false,
          access_token: accessToken,
        }),
      });

      const data = await readJson(response, "Facebook photo upload");
      mediaIds.push(data.id);
    }

    const response = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: composeCaption(payload),
        attached_media: mediaIds.map((id) => ({ media_fbid: id })),
        access_token: accessToken,
      }),
    });

    const post = await readJson(response, "Facebook feed post");

    return {
      externalId: post.id,
      permalink: post.id ? `https://facebook.com/${post.id}` : undefined,
    };
  },
};
