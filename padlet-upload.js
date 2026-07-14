import { put } from "@vercel/blob";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function POST(request) {
  try {
    const { apiKey: requestApiKey, boardId, title, imageData } = await request.json();
    const apiKey = String(requestApiKey || process.env.PADLET_API_KEY || "").trim();
    if (!apiKey) {
      return json({ error: "Padlet API Key가 입력되지 않았습니다." }, 400);
    }
    if (!boardId || !title || !imageData) {
      return json({ error: "boardId, title, imageData가 필요합니다." }, 400);
    }

    const match = /^data:image\/jpeg;base64,(.+)$/.exec(imageData);
    if (!match) {
      return json({ error: "JPEG 이미지 데이터 형식이 아닙니다." }, 400);
    }

    const imageBuffer = Buffer.from(match[1], "base64");
    if (imageBuffer.length > 3_300_000) {
      return json({ error: "이미지 용량이 너무 큽니다. 다시 촬영해 주세요." }, 413);
    }

    const safeTitle = String(title).replace(/[^\p{L}\p{N}_-]+/gu, "_");
    const pathname = `daechwita/${Date.now()}_${safeTitle}.jpg`;

    const blob = await put(pathname, imageBuffer, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });

    const padletResponse = await fetch(
      `https://api.padlet.dev/v1/boards/${encodeURIComponent(boardId)}/posts`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json",
        },
        body: JSON.stringify({
          data: {
            type: "post",
            attributes: {
              content: {
                subject: title,
                body: "",
                attachment: {
                  url: blob.url,
                  caption: title,
                },
              },
            },
          },
        }),
      }
    );

    const padletBody = await padletResponse.json().catch(() => ({}));
    if (!padletResponse.ok) {
      return json(
        {
          error:
            padletBody?.errors?.[0]?.detail ||
            padletBody?.message ||
            `Padlet 게시물 생성 실패 (${padletResponse.status})`,
          imageUrl: blob.url,
        },
        502
      );
    }

    return json({
      ok: true,
      title,
      imageUrl: blob.url,
      post: padletBody,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "서버 업로드 오류" }, 500);
  }
}
