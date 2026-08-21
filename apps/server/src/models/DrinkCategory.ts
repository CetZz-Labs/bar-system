import { Document, model, Schema, Types } from "mongoose";

export enum DrinkCategoryStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    DELETED = 'deleted',
}

export interface IDrinkCategory extends Document {
    bar: Types.ObjectId;
    name: string;
    price?: number;
    status: DrinkCategoryStatus;
    createdAt: Date;
    updatedAt: Date;
}

const drinkCategorySchema = new Schema<IDrinkCategory>({
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    price: {
        type: Number,
        min: 0,
    },
    status: {
        type: String,
        enum: Object.values(DrinkCategoryStatus),
        default: DrinkCategoryStatus.ACTIVE,
    },
}, {
    timestamps: true,
});

// Unique index: same name within a bar, excluding soft-deleted categories
drinkCategorySchema.index(
    { bar: 1, name: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: DrinkCategoryStatus.DELETED } } }
);

// Query index: list active categories by bar
drinkCategorySchema.index({ bar: 1, status: 1 });

const DrinkCategory = model<IDrinkCategory>('DrinkCategory', drinkCategorySchema);

export default DrinkCategory;
