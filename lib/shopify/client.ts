import { z } from "zod";

import { decryptSecret } from "@/lib/security/crypto";
import { normalizeShopifyProduct } from "@/lib/shopify/product-mirror";
import type { ShopifyProductMirrorInput } from "@/lib/shopify/types";

const tokenResponseSchema = z.object({
  access_token: z.string(),
  scope: z.string().optional(),
  expires_in: z.number().optional(),
});

const shopInfoSchema = z.object({
  shop: z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    domain: z.string().optional(),
    myshopify_domain: z.string().optional(),
  }),
});

type ProductMirrorGraphqlResponse = {
  products: {
    edges: Array<{ cursor: string; node: Record<string, unknown> }>;
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  };
};

type ShopifyCredentialInput = {
  shopDomain: string;
  authMethod?: "api_key" | "oauth";
  encryptedAccessToken?: string | null;
  apiClientId?: string | null;
  encryptedApiClientSecret?: string | null;
};

export function normalizeShopDomain(shop: string) {
  const trimmed = shop.trim().toLowerCase().replace(/^https?:\/\//, "");
  const withoutPath = trimmed.split("/")[0] ?? "";

  if (!withoutPath) {
    throw new Error("Enter a Shopify shop domain.");
  }

  return withoutPath.includes(".") ? withoutPath : `${withoutPath}.myshopify.com`;
}

export function buildShopifyAuthorizationUrl({
  shopDomain,
  state,
}: {
  shopDomain: string;
  state: string;
}) {
  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", requiredEnv("SHOPIFY_CLIENT_ID"));
  url.searchParams.set("scope", requiredEnv("SHOPIFY_SCOPES"));
  url.searchParams.set(
    "redirect_uri",
    `${requiredEnv("APP_URL")}/connections/shopify/callback`,
  );
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeShopifyCode({
  shopDomain,
  code,
}: {
  shopDomain: string;
  code: string;
}) {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("SHOPIFY_CLIENT_ID"),
      client_secret: requiredEnv("SHOPIFY_CLIENT_SECRET"),
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed with ${response.status}.`);
  }

  return tokenResponseSchema.parse(await response.json());
}

export async function exchangeShopifyClientCredentials({
  shopDomain,
  clientId,
  clientSecret,
}: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Shopify API key exchange failed with ${response.status}: ${text.slice(
        0,
        200,
      )}`,
    );
  }

  return tokenResponseSchema.parse(JSON.parse(text));
}

export async function resolveShopifyAccessToken(credentials: ShopifyCredentialInput) {
  if (credentials.authMethod === "api_key") {
    if (!credentials.apiClientId || !credentials.encryptedApiClientSecret) {
      throw new Error("Shopify API client ID and secret are required.");
    }

    const token = await exchangeShopifyClientCredentials({
      shopDomain: credentials.shopDomain,
      clientId: credentials.apiClientId,
      clientSecret: decryptSecret(credentials.encryptedApiClientSecret),
    });

    return token.access_token;
  }

  if (!credentials.encryptedAccessToken) {
    throw new Error("Shopify access token is missing.");
  }

  return decryptSecret(credentials.encryptedAccessToken);
}

export async function fetchShopInfo({
  shopDomain,
  accessToken,
  apiVersion,
}: {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string | null;
}) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${resolveApiVersion(apiVersion)}/shop.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify shop lookup failed with ${response.status}.`);
  }

  return shopInfoSchema.parse(await response.json()).shop;
}

export async function shopifyGraphql<T>({
  shopDomain,
  accessToken,
  apiVersion,
  query,
  variables,
}: {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string | null;
  query: string;
  variables?: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${resolveApiVersion(
      apiVersion,
    )}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify GraphQL failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      body.errors.map((error) => error.message ?? "Shopify error").join("; "),
    );
  }

  if (!body.data) {
    throw new Error("Shopify GraphQL returned no data.");
  }

  return body.data;
}

export async function fetchAllProducts({
  shopDomain,
  authMethod,
  encryptedAccessToken,
  apiClientId,
  encryptedApiClientSecret,
  apiVersion,
  limit = 500,
}: {
  shopDomain: string;
  authMethod?: "api_key" | "oauth";
  encryptedAccessToken?: string | null;
  apiClientId?: string | null;
  encryptedApiClientSecret?: string | null;
  apiVersion?: string | null;
  limit?: number;
}) {
  const accessToken = await resolveShopifyAccessToken({
    shopDomain,
    authMethod,
    encryptedAccessToken,
    apiClientId,
    encryptedApiClientSecret,
  });
  const products: ShopifyProductMirrorInput[] = [];
  let cursor: string | null = null;

  while (products.length < limit) {
    const data: ProductMirrorGraphqlResponse =
      await shopifyGraphql<ProductMirrorGraphqlResponse>({
      shopDomain,
      accessToken,
      apiVersion,
      query: PRODUCT_MIRROR_QUERY,
      variables: { cursor, first: Math.min(100, limit - products.length) },
    });

    products.push(
      ...data.products.edges.map((edge) => normalizeShopifyProduct(edge.node)),
    );

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor ?? null;
    if (!cursor) break;
  }

  return products;
}

export async function setProductReferenceMetafield({
  shopDomain,
  authMethod,
  encryptedAccessToken,
  apiClientId,
  encryptedApiClientSecret,
  apiVersion,
  productId,
  namespace,
  key,
  referenceProductIds,
}: {
  shopDomain: string;
  authMethod?: "api_key" | "oauth";
  encryptedAccessToken?: string | null;
  apiClientId?: string | null;
  encryptedApiClientSecret?: string | null;
  apiVersion?: string | null;
  productId: string;
  namespace: string;
  key: string;
  referenceProductIds: string[];
}) {
  const accessToken = await resolveShopifyAccessToken({
    shopDomain,
    authMethod,
    encryptedAccessToken,
    apiClientId,
    encryptedApiClientSecret,
  });
  const data = await shopifyGraphql<{
    metafieldsSet: {
      metafields: Array<{ id: string; namespace: string; key: string; value: string }>;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>({
    shopDomain,
    accessToken,
    apiVersion,
    query: SET_PRODUCT_REFERENCE_METAFIELD_MUTATION,
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace,
          key,
          type: "list.product_reference",
          value: JSON.stringify(referenceProductIds),
        },
      ],
    },
  });

  const errors = data.metafieldsSet.userErrors;
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }

  return data.metafieldsSet.metafields[0];
}

export async function verifyProductReferenceMetafield({
  shopDomain,
  authMethod,
  encryptedAccessToken,
  apiClientId,
  encryptedApiClientSecret,
  apiVersion,
  productId,
  namespace,
  key,
  referenceProductIds,
}: {
  shopDomain: string;
  authMethod?: "api_key" | "oauth";
  encryptedAccessToken?: string | null;
  apiClientId?: string | null;
  encryptedApiClientSecret?: string | null;
  apiVersion?: string | null;
  productId: string;
  namespace: string;
  key: string;
  referenceProductIds: string[];
}) {
  const accessToken = await resolveShopifyAccessToken({
    shopDomain,
    authMethod,
    encryptedAccessToken,
    apiClientId,
    encryptedApiClientSecret,
  });
  const data = await shopifyGraphql<{
    product: {
      metafield?: { value?: string | null } | null;
    } | null;
  }>({
    shopDomain,
    accessToken,
    apiVersion,
    query: VERIFY_PRODUCT_REFERENCE_METAFIELD_QUERY,
    variables: { productId, namespace, key },
  });

  const value = data.product?.metafield?.value;
  if (!value) return false;

  try {
    const parsed = JSON.parse(value) as string[];
    return referenceProductIds.every((id) => parsed.includes(id));
  } catch {
    return referenceProductIds.every((id) => value.includes(id));
  }
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function resolveApiVersion(apiVersion?: string | null) {
  return apiVersion ?? defaultApiVersion();
}

function defaultApiVersion() {
  return process.env.SHOPIFY_API_VERSION ?? "2026-04";
}

const PRODUCT_MIRROR_QUERY = /* GraphQL */ `
  query ProductMirror($first: Int!, $cursor: String) {
    products(first: $first, after: $cursor) {
      edges {
        cursor
        node {
          id
          handle
          title
          status
          vendor
          productType
          tags
          totalInventory
          descriptionHtml
          updatedAt
          featuredImage {
            url
          }
          metafields(first: 100) {
            edges {
              node {
                id
                namespace
                key
                type
                value
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SET_PRODUCT_REFERENCE_METAFIELD_MUTATION = /* GraphQL */ `
  mutation SetProductReferenceMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VERIFY_PRODUCT_REFERENCE_METAFIELD_QUERY = /* GraphQL */ `
  query VerifyProductReferenceMetafield($productId: ID!, $namespace: String!, $key: String!) {
    product(id: $productId) {
      metafield(namespace: $namespace, key: $key) {
        value
      }
    }
  }
`;
