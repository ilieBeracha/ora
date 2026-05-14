export type ShopifyMetafield = {
  id?: string;
  namespace: string;
  key: string;
  type?: string;
  value?: string | null;
  reference?: {
    id: string;
    title?: string;
    handle?: string;
  } | null;
  references?: Array<{
    id: string;
    title?: string;
    handle?: string;
  }>;
};

export type ShopifyProductMirrorInput = {
  shopifyProductId: string;
  handle: string;
  title: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  totalInventory?: number | null;
  imageUrl?: string | null;
  descriptionPlain?: string | null;
  metafieldsJson: ShopifyMetafield[];
  rawJson: unknown;
  shopifyUpdatedAt?: Date | null;
};

export type ProductForDetection = {
  shopifyProductId: string;
  handle: string;
  title: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  totalInventory?: number | null;
  imageUrl?: string | null;
  descriptionPlain?: string | null;
  metafieldsJson?: unknown;
};

