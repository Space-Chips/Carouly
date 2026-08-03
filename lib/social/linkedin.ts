import {
  Adapter,
  LinkedInCredentials,
  composeCaption,
  fetchImage,
  readJson,
} from "./types";

const API = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202411";

/**
 * LinkedIn multi-image post.
 *
 * Each image is registered, uploaded as raw bytes to the returned URL, then
 * all of them are attached to one post via content.multiImage.
 * Token needs w_member_social (personal) or w_organization_social (company).
 */
export const linkedin: Adapter<LinkedInCredentials> = {
  platform: "linkedin",
  label: "LinkedIn",
  docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api",
  fields: [
    { key: "accessToken", label: "Access token", secret: true },
    {
      key: "authorUrn",
      label: "Author URN",
      hint: "urn:li:person:xxxx or urn:li:organization:12345",
    },
  ],

  async publish(credentials, payload) {
    const { accessToken, authorUrn } = credentials;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    };

    const imageUrns: string[] = [];

    for (const imageUrl of payload.imageUrls) {
      const initResponse = await fetch(`${API}/images?action=initializeUpload`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
      });

      const init = await readJson(initResponse, "LinkedIn image init");
      const { uploadUrl, image } = init.value ?? {};

      const { bytes, contentType } = await fetchImage(imageUrl);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": contentType,
        },
        body: new Uint8Array(bytes),
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `LinkedIn image upload failed (${uploadResponse.status}).`
        );
      }

      imageUrns.push(image);
    }

    const commentary = composeCaption(payload, 3000);

    const postResponse = await fetch(`${API}/posts`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        author: authorUrn,
        commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content:
          imageUrns.length > 1
            ? {
                multiImage: {
                  images: imageUrns.map((id) => ({ id })),
                },
              }
            : { media: { id: imageUrns[0] } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!postResponse.ok) {
      const detail = await postResponse.text();
      throw new Error(
        `LinkedIn post failed (${postResponse.status}): ${detail.slice(0, 400)}`
      );
    }

    const postId =
      postResponse.headers.get("x-restli-id") ??
      postResponse.headers.get("x-linkedin-id") ??
      undefined;

    return {
      externalId: postId,
      permalink: postId
        ? `https://www.linkedin.com/feed/update/${postId}`
        : undefined,
    };
  },
};
