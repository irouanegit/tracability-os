import { generateProductionLotNumber } from "./productionLotCodification";
import {
  createProductionWithTraceability,
  fetchAvailableLotsForProduct,
  fetchProductSchema,
  type AvailableLotOption,
  type Product,
  type ProductSchemaNode,
} from "./traceabilityApi";
import type { ScheduledRule } from "./schedulerEngine";

export type RuleExecutionResult = {
  ruleId: string;
  productId: string;
  productName: string;
  status: "success" | "warning" | "error";
  summary: string;
  generatedLot: string | null;
  errorDetails: string | null;
  executedAt: string;
};

export async function executeScheduledRule(
  rule: ScheduledRule,
  productMap: Map<string, Product>,
  executedRuleIdsToday: Set<string> = new Set(),
  depth = 0,
): Promise<RuleExecutionResult> {
  const executedAt = new Date().toISOString();
  const todayDate = executedAt.slice(0, 10);
  const product = productMap.get(rule.productId);

  if (!product) {
    return {
      ruleId: rule.id,
      productId: rule.productId,
      productName: rule.productName,
      status: "error",
      summary: `Produit introuvable (ID: ${rule.productId})`,
      generatedLot: null,
      errorDetails: `Le produit ${rule.productName} n'existe plus dans le catalogue.`,
      executedAt,
    };
  }

  // Generate production lot number
  const generatedLot = generateProductionLotNumber(product, todayDate);
  if (!generatedLot) {
    return {
      ruleId: rule.id,
      productId: rule.productId,
      productName: rule.productName,
      status: "error",
      summary: `Impossible de générer le lot pour ${product.name}`,
      generatedLot: null,
      errorDetails: `Codification ou zone manquante pour la catégorie ${product.category ?? "inconnue"}.`,
      executedAt,
    };
  }

  try {
    // 1. Fetch schema tree for the product
    const schemaNodes = await fetchProductSchema(product.id);
    if (schemaNodes.length === 0) {
      return {
        ruleId: rule.id,
        productId: rule.productId,
        productName: rule.productName,
        status: "warning",
        summary: `Confirmation annulée : schéma vide pour ${product.name}`,
        generatedLot: null,
        errorDetails: `Aucun composant défini dans la recette de ${product.name}.`,
        executedAt,
      };
    }

    // 2. Recursively resolve consumed lots for all components
    const consumedLotIds: string[] = [];
    const missingItems: string[] = [];

    async function resolveNode(node: ProductSchemaNode) {
      // Water / non-traceable items skip lot selection
      if (isWaterNode(node)) return;

      if (node.type === "raw") {
        const lots = await fetchAvailableLotsForProduct(node.id, 5);
        if (lots.length === 0 || !lots[0]?.id) {
          missingItems.push(`Matière première "${node.name}"`);
        } else {
          consumedLotIds.push(lots[0].id);
        }
        return;
      }

      if (node.type === "semi_finished") {
        // First resolve any children of this semi-finished node
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            await resolveNode(child);
          }
        }

        // Fetch latest available lot for this semi-finished product
        const lots = await fetchAvailableLotsForProduct(node.id, 5);
        if (lots.length === 0 || !lots[0]?.id) {
          missingItems.push(`Semi-fini "${node.name}"`);
        } else {
          consumedLotIds.push(lots[0].id);
        }
      }
    }

    for (const node of schemaNodes) {
      await resolveNode(node);
    }

    if (missingItems.length > 0) {
      return {
        ruleId: rule.id,
        productId: rule.productId,
        productName: rule.productName,
        status: "warning",
        summary: `Confirmation annulée : lots manquants pour ${product.name}`,
        generatedLot: null,
        errorDetails: `Aucun lot disponible pour : ${missingItems.join(", ")}.`,
        executedAt,
      };
    }

    // 3. Create production batch with traceability
    const uniqueConsumedLotIds = [...new Set(consumedLotIds)].filter(Boolean);
    const batchId = await createProductionWithTraceability({
      productionDate: new Date(`${todayDate}T06:30`).toISOString(),
      productId: product.id,
      generatedLot,
      responsibleName: "Planification auto",
      operation: "Confirmation automatique récurrente",
      observations: `Généré par la règle de planification pour "${rule.productName}"`,
      consumedLotIds: uniqueConsumedLotIds,
    });

    executedRuleIdsToday.add(rule.id);

    return {
      ruleId: rule.id,
      productId: rule.productId,
      productName: rule.productName,
      status: "success",
      summary: `Production confirmée : Lot ${generatedLot} (${uniqueConsumedLotIds.length} composant(s))`,
      generatedLot,
      errorDetails: null,
      executedAt,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      ruleId: rule.id,
      productId: rule.productId,
      productName: rule.productName,
      status: "error",
      summary: `Échec d'exécution pour ${product.name}`,
      generatedLot: null,
      errorDetails: errorMsg,
      executedAt,
    };
  }
}

function isWaterNode(node: ProductSchemaNode): boolean {
  const name = node.name.toLowerCase().trim();
  return name === "eau" || name.includes("eau potable") || name.includes("eau de coulage");
}
