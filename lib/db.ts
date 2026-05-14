import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

const prismaSchemaSignature = Object.keys(
  Prisma.ShopifyConnectionScalarFieldEnum,
)
  .concat(Object.keys(Prisma.ModelName))
  .join("|");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaSignature?: string;
};

export const prisma =
  globalForPrisma.prisma &&
  globalForPrisma.prismaSchemaSignature === prismaSchemaSignature
    ? globalForPrisma.prisma
    : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaSignature = prismaSchemaSignature;
}
