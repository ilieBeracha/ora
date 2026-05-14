import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { fetchAllProducts } from "@/lib/shopify/client";

export async function syncProductMirror(shopifyConnectionId: string) {
  const connection = await prisma.shopifyConnection.findUniqueOrThrow({
    where: { id: shopifyConnectionId },
  });

  await prisma.shopifyConnection.update({
    where: { id: connection.id },
    data: {
      lastSyncStatus: "running",
      lastSyncError: null,
    },
  });

  try {
    const products = await fetchAllProducts({
      shopDomain: connection.shopDomain,
      authMethod: connection.authMethod,
      encryptedAccessToken: connection.encryptedAccessToken,
      apiClientId: connection.apiClientId,
      encryptedApiClientSecret: connection.encryptedApiClientSecret,
      apiVersion: connection.apiVersion,
    });

    for (const product of products) {
      await prisma.productMirror.upsert({
        where: {
          shopifyConnectionId_shopifyProductId: {
            shopifyConnectionId: connection.id,
            shopifyProductId: product.shopifyProductId,
          },
        },
        update: {
          handle: product.handle,
          title: product.title,
          status: product.status,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          totalInventory: product.totalInventory,
          imageUrl: product.imageUrl,
          descriptionPlain: product.descriptionPlain,
          metafieldsJson: product.metafieldsJson as Prisma.InputJsonValue,
          rawJson: product.rawJson as Prisma.InputJsonValue,
          shopifyUpdatedAt: product.shopifyUpdatedAt,
        },
        create: {
          shopifyConnectionId: connection.id,
          shopifyProductId: product.shopifyProductId,
          handle: product.handle,
          title: product.title,
          status: product.status,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          totalInventory: product.totalInventory,
          imageUrl: product.imageUrl,
          descriptionPlain: product.descriptionPlain,
          metafieldsJson: product.metafieldsJson as Prisma.InputJsonValue,
          rawJson: product.rawJson as Prisma.InputJsonValue,
          shopifyUpdatedAt: product.shopifyUpdatedAt,
        },
      });
    }

    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: `synced ${products.length} products`,
      },
    });

    return { count: products.length };
  } catch (error) {
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncStatus: "failed",
        lastSyncError:
          error instanceof Error ? error.message : "Unknown sync failure",
      },
    });
    throw error;
  }
}
