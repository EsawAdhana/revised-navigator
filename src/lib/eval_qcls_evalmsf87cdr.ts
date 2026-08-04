export class CartLine_evalmsf87cdr {
  constructor(private item?: { sku: string }) {}
  sku() { return this.item!.sku.toUpperCase(); }
}
