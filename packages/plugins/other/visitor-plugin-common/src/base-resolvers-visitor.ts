import { ParsedConfig, RawConfig, BaseVisitor, BaseVisitorConvertOptions } from './base-visitor';
import autoBind from 'auto-bind';
import { DEFAULT_SCALARS } from './scalars';
import {
  NormalizedScalarsMap,
  EnumValuesMap,
  ParsedEnumValuesMap,
  DeclarationKind,
  ConvertOptions,
  AvoidOptionalsConfig,
} from './types';
import {
  DeclarationBlock,
  DeclarationBlockConfig,
  indent,
  getBaseTypeNode,
  getConfigValue,
  stripMapperTypeInterpolation,
  OMIT_TYPE,
  REQUIRE_FIELDS_TYPE,
  wrapTypeWithModifiers,
  buildScalarsFromConfig,
} from './utils';
import {
  NameNode,
  ListTypeNode,
  NamedTypeNode,
  FieldDefinitionNode,
  ObjectTypeDefinitionNode,
  GraphQLSchema,
  NonNullTypeNode,
  UnionTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  isObjectType,
  isInterfaceType,
  isNonNullType,
  isUnionType,
  GraphQLNamedType,
  isEnumType,
  DirectiveDefinitionNode,
  GraphQLObjectType,
  InputValueDefinitionNode,
  EnumTypeDefinitionNode,
  ASTNode,
} from 'graphql';

import { OperationVariablesToObject } from './variables-to-object';
import { ParsedMapper, parseMapper, transformMappers, ExternalParsedMapper, buildMapperImport } from './mappers';
import { parseEnumValues } from './enum-values';
import { ApolloFederation, getBaseType } from '@graphql-codegen/plugin-helpers';
import { getRootTypeNames } from '@graphql-tools/utils';

export interface ParsedResolversConfig extends ParsedConfig {
  contextType: ParsedMapper;
  fieldContextTypes: Array<string>;
  directiveContextTypes: Array<string>;
  rootValueType: ParsedMapper;
  mappers: {
    [typeName: string]: ParsedMapper;
  };
  defaultMapper: ParsedMapper | null;
  avoidOptionals: AvoidOptionalsConfig;
  addUnderscoreToArgsType: boolean;
  enumValues: ParsedEnumValuesMap;
  resolverTypeWrapperSignature: string;
  federation: boolean;
  enumPrefix: boolean;
  optionalResolveType: boolean;
  immutableTypes: boolean;
  namespacedImportName: string;
  resolverTypeSuffix: string;
  allResolversTypeName: string;
  internalResolversPrefix: string;
  onlyResolveTypeForInterfaces: boolean;
  directiveResolverMappings: Record<string, string>;
}

export interface RawResolversConfig extends RawConfig {
  /**
   * @description Adds `_` to generated `Args` types in order to avoid duplicate identifiers.
   *
   * @exampleMarkdown
   * ```yaml
   *   config:
   *     addUnderscoreToArgsType: true
   * ```
   *
   */
  addUnderscoreToArgsType?: boolean;
  /**
   * @description Use this configuration to set a custom type for your `context`, and it will
   * affect all the resolvers, without the need to override it using generics each time.
   * If you wish to use an external type and import it from another file, you can use `add` plugin
   * and add the required `import` statement, or you can use a `module#type` syntax.
   *
   * @exampleMarkdown
   * ## Custom Context Type
   *
   * ```yaml
   * plugins
   *   config:
   *     contextType: MyContext
   * ```
   *
   * ## Custom Context Type
   *
   * ```yaml
   * plugins
   *   config:
   *     contextType: ./my-types#MyContext
   * ```
   */
  contextType?: string;
  /**
   * @description Use this to set a custom type for a specific field `context`.
   * It will only affect the targeted resolvers.
   * You can either use `Field.Path#ContextTypeName` or `Field.Path#ExternalFileName#ContextTypeName`
   *
   * @exampleMarkdown
   * ## Custom Field Context Types
   *
   * ```yaml
   * plugins
   *   config:
   *     fieldContextTypes:
   *       - MyType.foo#CustomContextType
   *       - MyType.bar#./my-file#ContextTypeOne
   * ```
   *
   */
  fieldContextTypes?: Array<string>;
  /**
   * @description Use this configuration to set a custom type for the `rootValue`, and it will
   * affect resolvers of all root types (Query, Mutation and Subscription), without the need to override it using generics each time.
   * If you wish to use an external type and import it from another file, you can use `add` plugin
   * and add the required `import` statement, or you can use both `module#type` or `module#namespace#type` syntax.
   *
   * @exampleMarkdown
   * ## Custom RootValue Type
   *
   * ```yaml
   * plugins
   *   config:
   *     rootValueType: MyRootValue
   * ```
   *
   * ## Custom RootValue Type
   *
   * ```yaml
   * plugins
   *   config:
   *     rootValueType: ./my-types#MyRootValue
   * ```
   */
  rootValueType?: string;
  /**
   * @description Use this to set a custom type for a specific field `context` decorated by a directive.
   * It will only affect the targeted resolvers.
   * You can either use `Field.Path#ContextTypeName` or `Field.Path#ExternalFileName#ContextTypeName`
   *
   * ContextTypeName should by a generic Type that take the context or field context type as only type parameter.
   *
   * @exampleMarkdown
   * ## Directive Context Extender
   *
   * ```yaml
   * plugins
   *   config:
   *     directiveContextTypes:
   *       - myCustomDirectiveName#./my-file#CustomContextExtender
   * ```
   *
   */
  directiveContextTypes?: Array<string>;
  /**
   * @description Adds a suffix to the imported names to prevent name clashes.
   *
   * @exampleMarkdown
   * ```yaml
   * plugins
   *   config:
   *     mapperTypeSuffix: Model
   * ```
   */
  mapperTypeSuffix?: string;
  /**
   * @description Replaces a GraphQL type usage with a custom type, allowing you to return custom object from
   * your resolvers.
   * You can use both `module#type` and `module#namespace#type` syntax.
   *
   * @exampleMarkdown
   * ## Custom Context Type
   *
   * ```yaml
   * plugins
   *   config:
   *     mappers:
   *       User: ./my-models#UserDbObject
   *       Book: ./my-models#Collections#Book
   * ```
   */
  mappers?: { [typeName: string]: string };
  /**
   * @description Allow you to set the default mapper when it's not being override by `mappers` or generics.
   * You can specify a type name, or specify a string in `module#type` or `module#namespace#type` format.
   * The default value of mappers is the TypeScript type generated by `typescript` package.
   *
   * @exampleMarkdown
   * ## Replace with any
   *
   * ```yaml
   * plugins
   *   config:
   *     defaultMapper: any
   * ```
   *
   * ## Custom Base Object
   *
   * ```yaml
   * plugins
   *   config:
   *     defaultMapper: ./my-file#BaseObject
   * ```
   *
   * ## Wrap default types with Partial
   *
   * You can also specify a custom wrapper for the original type, without overriding the original generated types, use `{T}` to specify the identifier. (for flow, use `$Shape<{T}>`)
   *
   * ```yaml
   * plugins
   *   config:
   *     defaultMapper: Partial<{T}>
   * ```
   *
   * ## Allow deep partial with `utility-types`
   *
   * ```yaml
   * plugins
   *   plugins:
   *     - 'typescript'
   *     - 'typescript-resolvers'
   *     - add:
   *         content: "import { DeepPartial } from 'utility-types';"
   *   config:
   *     defaultMapper: DeepPartial<{T}>
   * ```
   */
  defaultMapper?: string;
  /**
   * @description This will cause the generator to avoid using optionals (`?`),
   * so all field resolvers must be implemented in order to avoid compilation errors.
   * @default false
   *
   * @exampleMarkdown
   * ## Override all definition types
   *
   * ```yaml
   * generates:
   *   path/to/file.ts:
   *     plugins:
   *       - typescript
   *       - typescript-resolvers
   *     config:
   *       avoidOptionals: true
   * ```
   *
   * ## Override only specific definition types
   *
   * ```yaml
   * generates:
   *   path/to/file.ts:
   *     plugins:
   *       - typescript
   *     config:
   *       avoidOptionals:
   *         field: true
   *         inputValue: true
   *         object: true
   *         defaultValue: true
   * ```
   */
  avoidOptionals?: boolean | AvoidOptionalsConfig;
  /**
   * @description Warns about unused mappers.
   * @default true
   *
   * @exampleMarkdown
   * ```yaml
   * generates:
   *   path/to/file.ts:
   *     plugins:
   *       - typescript
   *       - typescript-resolvers
   *     config:
   *       showUnusedMappers: true
   * ```
   */
  showUnusedMappers?: boolean;
  /**
   * @description Overrides the default value of enum values declared in your GraphQL schema, supported
   * in this plugin because of the need for integration with `typescript` package.
   * See documentation under `typescript` plugin for more information and examples.
   */
  enumValues?: EnumValuesMap;
  /**
   * @default Promise<T> | T
   * @description Allow you to override `resolverTypeWrapper` definition.
   */
  resolverTypeWrapperSignature?: string;
  /**
   * @default false
   * @description Supports Apollo Federation
   */
  federation?: boolean;
  /**
   * @default true
   * @description Allow you to disable prefixing for generated enums, works in combination with `typesPrefix`.
   *
   * @exampleMarkdown
   * ## Disable enum prefixes
   *
   * ```yaml
   *   config:
   *     typesPrefix: I
   *     enumPrefix: false
   * ```
   */
  enumPrefix?: boolean;
  /**
   * @default false
   * @description Sets the `__resolveType` field as optional field.
   */
  optionalResolveType?: boolean;
  /**
   * @default false
   * @description Generates immutable types by adding `readonly` to properties and uses `ReadonlyArray`.
   */
  immutableTypes?: boolean;
  /**
   * @default ''
   * @description Prefixes all GraphQL related generated types with that value, as namespaces import.
   * You can use this feature to allow separation of plugins to different files.
   */
  namespacedImportName?: string;
  /**
   * @default Resolvers
   * @description Suffix we add to each generated type resolver.
   */
  resolverTypeSuffix?: string;
  /**
   * @default Resolvers
   * @description The type name to use when exporting all resolvers signature as unified type.
   */
  allResolversTypeName?: string;
  /**
   * @type string
   * @default '__'
   * @description Defines the prefix value used for `__resolveType` and `__isTypeOf` resolvers.
   * If you are using `mercurius-js`, please set this field to empty string for better compatibility.
   */
  internalResolversPrefix?: string;
  /**
   * @type boolean
   * @default false
   * @description Turning this flag to `true` will generate resolver signature that has only `resolveType` for interfaces, forcing developers to write inherited type resolvers in the type itself.
   */
  onlyResolveTypeForInterfaces?: boolean;
  /**
   * @ignore
   */
  directiveResolverMappings?: Record<string, string>;
}

export type ResolverTypes = { [gqlType: string]: string };
export type ResolverParentTypes = { [gqlType: string]: string };
export type GroupedMappers = Record<string, { identifier: string; asDefault?: boolean }[]>;
type FieldContextTypeMap = Record<string, ParsedMapper>;

export class BaseResolversVisitor<
  TRawConfig extends RawResolversConfig = RawResolversConfig,
  TPluginConfig extends ParsedResolversConfig = ParsedResolversConfig
> extends BaseVisitor<TRawConfig, TPluginConfig> {
  protected _parsedConfig: TPluginConfig;
  protected _declarationBlockConfig: DeclarationBlockConfig = {};
  protected _collectedResolvers: { [key: string]: string } = {};
  protected _collectedDirectiveResolvers: { [key: string]: string } = {};
  protected _variablesTransformer: OperationVariablesToObject;
  protected _usedMappers: { [key: string]: boolean } = {};
  protected _resolversTypes: ResolverTypes = {};
  protected _resolversParentTypes: ResolverParentTypes = {};
  protected _rootTypeNames = new Set<string>();
  protected _globalDeclarations = new Set<string>();
  protected _federation: ApolloFederation;
  protected _hasScalars = false;
  protected _hasFederation = false;
  protected _fieldContextTypeMap: FieldContextTypeMap;
  protected _directiveContextTypesMap: FieldContextTypeMap;
  private _directiveResolverMappings: Record<string, string>;
  private _shouldMapType: { [typeName: string]: boolean } = {};

  constructor(
    rawConfig: TRawConfig,
    additionalConfig: TPluginConfig,
    private _schema: GraphQLSchema,
    defaultScalars: NormalizedScalarsMap = DEFAULT_SCALARS
  ) {
    super(rawConfig, {
      immutableTypes: getConfigValue(rawConfig.immutableTypes, false),
      optionalResolveType: getConfigValue(rawConfig.optionalResolveType, false),
      enumPrefix: getConfigValue(rawConfig.enumPrefix, true),
      federation: getConfigValue(rawConfig.federation, false),
      resolverTypeWrapperSignature: getConfigValue(rawConfig.resolverTypeWrapperSignature, 'Promise<T> | T'),
      enumValues: parseEnumValues({
        schema: _schema,
        mapOrStr: rawConfig.enumValues,
      }),
      addUnderscoreToArgsType: getConfigValue(rawConfig.addUnderscoreToArgsType, false),
      onlyResolveTypeForInterfaces: getConfigValue(rawConfig.onlyResolveTypeForInterfaces, false),
      contextType: parseMapper(rawConfig.contextType || 'any', 'ContextType'),
      fieldContextTypes: getConfigValue(rawConfig.fieldContextTypes, []),
      directiveContextTypes: getConfigValue(rawConfig.directiveContextTypes, []),
      resolverTypeSuffix: getConfigValue(rawConfig.resolverTypeSuffix, 'Resolvers'),
      allResolversTypeName: getConfigValue(rawConfig.allResolversTypeName, 'Resolvers'),
      rootValueType: parseMapper(rawConfig.rootValueType || '{}', 'RootValueType'),
      namespacedImportName: getConfigValue(rawConfig.namespacedImportName, ''),
      avoidOptionals: getConfigValue(rawConfig.avoidOptionals, false),
      defaultMapper: rawConfig.defaultMapper
        ? parseMapper(rawConfig.defaultMapper || 'any', 'DefaultMapperType')
        : null,
      mappers: transformMappers(rawConfig.mappers || {}, rawConfig.mapperTypeSuffix),
      scalars: buildScalarsFromConfig(_schema, rawConfig, defaultScalars),
      internalResolversPrefix: getConfigValue(rawConfig.internalResolversPrefix, '__'),
      ...additionalConfig,
    } as TPluginConfig);

    autoBind(this);
    this._federation = new ApolloFederation({ enabled: this.config.federation, schema: this.schema });
    this._rootTypeNames = getRootTypeNames(_schema);
    this._variablesTransformer = new OperationVariablesToObject(
      this.scalars,
      this.convertName,
      this.config.namespacedImportName
    );
    this._resolversTypes = this.createResolversFields(
      type => this.applyResolverTypeWrapper(type),
      type => this.clearResolverTypeWrapper(type),
      name => this.getTypeToUse(name)
    );
    this._resolversParentTypes = this.createResolversFields(
      type => type,
      type => type,
      name => this.getParentTypeToUse(name),
      namedType => !isEnumType(namedType)
    );
    this._fieldContextTypeMap = this.createFieldContextTypeMap();
    this._directiveContextTypesMap = this.createDirectivedContextType();
    this._directiveResolverMappings = rawConfig.directiveResolverMappings ?? {};
  }

  public getResolverTypeWrapperSignature(): string {
    return `export type ResolverTypeWrapper<T> = ${this.config.resolverTypeWrapperSignature};`;
  }

  protected shouldMapType(type: GraphQLNamedType, duringCheck: string[] = []): boolean {
    if (type.name.startsWith('__') || this.config.scalars[type.name]) {
      return false;
    }

    if (this.config.mappers[type.name]) {
      return true;
    }

    if (isObjectType(type) || isInterfaceType(type)) {
      const fields = type.getFields();

      return Object.keys(fields)
        .filter(fieldName => {
          const field = fields[fieldName];
          const fieldType = getBaseType(field.type);

          return !duringCheck.includes(fieldType.name);
        })
        .some(fieldName => {
          const field = fields[fieldName];
          const fieldType = getBaseType(field.type);

          if (this._shouldMapType[fieldType.name] !== undefined) {
            return this._shouldMapType[fieldType.name];
          }

          if (this.config.mappers[type.name]) {
            return true;
          }

          duringCheck.push(type.name);
          const innerResult = this.shouldMapType(fieldType, duringCheck);

          return innerResult;
        });
    }

    return false;
  }

  public convertName(
    node: ASTNode | string,
    options?: BaseVisitorConvertOptions & ConvertOptions,
    applyNamespacedImport = false
  ): string {
    const sourceType = super.convertName(node, options);

    return `${
      applyNamespacedImport && this.config.namespacedImportName ? this.config.namespacedImportName + '.' : ''
    }${sourceType}`;
  }

  // Kamil: this one is heeeeavvyyyy
  protected createResolversFields(
    applyWrapper: (str: string) => string,
    clearWrapper: (str: string) => string,
    getTypeToUse: (str: string) => string,
    shouldInclude?: (type: GraphQLNamedType) => boolean
  ): ResolverTypes {
    const allSchemaTypes = this._schema.getTypeMap();
    const typeNames = this._federation.filterTypeNames(Object.keys(allSchemaTypes));

    // avoid checking all types recursively if we have no `mappers` defined
    if (Object.keys(this.config.mappers).length > 0) {
      typeNames.forEach(typeName => {
        if (this._shouldMapType[typeName] === undefined) {
          const schemaType = allSchemaTypes[typeName];
          this._shouldMapType[typeName] = this.shouldMapType(schemaType);
        }
      });
    }

    return typeNames.reduce((prev: ResolverTypes, typeName: string) => {
      const schemaType = allSchemaTypes[typeName];

      if (typeName.startsWith('__') || (shouldInclude && !shouldInclude(schemaType))) {
        return prev;
      }

      let shouldApplyOmit = false;
      const isRootType = this._rootTypeNames.has(typeName);
      const isMapped = this.config.mappers[typeName];
      const isScalar = this.config.scalars[typeName];
      const hasDefaultMapper = !!(this.config.defaultMapper && this.config.defaultMapper.type);

      if (isRootType) {
        prev[typeName] = applyWrapper(this.config.rootValueType.type);

        return prev;
      }
      if (isMapped && this.config.mappers[typeName].type) {
        this.markMapperAsUsed(typeName);
        prev[typeName] = applyWrapper(this.config.mappers[typeName].type);
      } else if (isInterfaceType(schemaType)) {
        const allTypesMap = this._schema.getTypeMap();
        const implementingTypes: string[] = [];

        for (const graphqlType of Object.values(allTypesMap)) {
          if (graphqlType instanceof GraphQLObjectType) {
            const allInterfaces = graphqlType.getInterfaces();

            if (allInterfaces.some(int => int.name === schemaType.name)) {
              implementingTypes.push(graphqlType.name);
            }
          }
        }

        const possibleTypes = implementingTypes.map(name => getTypeToUse(name)).join(' | ') || 'never';

        prev[typeName] = possibleTypes;
        return prev;
      } else if (isEnumType(schemaType) && this.config.enumValues[typeName]) {
        prev[typeName] =
          this.config.enumValues[typeName].sourceIdentifier ||
          this.convertName(this.config.enumValues[typeName].typeIdentifier);
      } else if (hasDefaultMapper && !hasPlaceholder(this.config.defaultMapper.type)) {
        prev[typeName] = applyWrapper(this.config.defaultMapper.type);
      } else if (isScalar) {
        prev[typeName] = applyWrapper(this._getScalar(typeName));
      } else if (isUnionType(schemaType)) {
        prev[typeName] = schemaType
          .getTypes()
          .map(type => getTypeToUse(type.name))
          .join(' | ');
      } else if (isEnumType(schemaType)) {
        prev[typeName] = this.convertName(typeName, { useTypesPrefix: this.config.enumPrefix }, true);
      } else {
        shouldApplyOmit = true;
        prev[typeName] = this.convertName(typeName, {}, true);
      }

      if (shouldApplyOmit && prev[typeName] !== 'any' && isObjectType(schemaType)) {
        const fields = schemaType.getFields();
        const relevantFields: {
          addOptionalSign: boolean;
          fieldName: string;
          replaceWithType: string;
        }[] = this._federation
          .filterFieldNames(Object.keys(fields))
          .filter(fieldName => {
            const field = fields[fieldName];
            const baseType = getBaseType(field.type);

            // Filter out fields of types that are not included
            if (shouldInclude && !shouldInclude(baseType)) {
              return false;
            }
            return true;
          })
          .map(fieldName => {
            const field = fields[fieldName];
            const baseType = getBaseType(field.type);
            const isUnion = isUnionType(baseType);

            if (!this.config.mappers[baseType.name] && !isUnion && !this._shouldMapType[baseType.name]) {
              return null;
            }

            const addOptionalSign = !this.config.avoidOptionals && !isNonNullType(field.type);

            return {
              addOptionalSign,
              fieldName,
              replaceWithType: wrapTypeWithModifiers(getTypeToUse(baseType.name), field.type, {
                wrapOptional: this.applyMaybe,
                wrapArray: this.wrapWithArray,
              }),
            };
          })
          .filter(a => a);

        if (relevantFields.length > 0) {
          // Puts ResolverTypeWrapper on top of an entire type
          prev[typeName] = applyWrapper(this.replaceFieldsInType(prev[typeName], relevantFields));
        } else {
          // We still want to use ResolverTypeWrapper, even if we don't touch any fields
          prev[typeName] = applyWrapper(prev[typeName]);
        }
      }

      if (isMapped && hasPlaceholder(prev[typeName])) {
        prev[typeName] = replacePlaceholder(prev[typeName], typeName);
      }

      if (!isMapped && hasDefaultMapper && hasPlaceholder(this.config.defaultMapper.type)) {
        // Make sure the inner type has no ResolverTypeWrapper
        const name = clearWrapper(isScalar ? this._getScalar(typeName) : prev[typeName]);
        const replaced = replacePlaceholder(this.config.defaultMapper.type, name);

        // Don't wrap Union with ResolverTypeWrapper, each inner type already has it
        if (isUnionType(schemaType)) {
          prev[typeName] = replaced;
        } else {
          prev[typeName] = applyWrapper(replacePlaceholder(this.config.defaultMapper.type, name));
        }
      }

      return prev;
    }, {} as ResolverTypes);
  }

  protected replaceFieldsInType(
    typeName: string,
    relevantFields: { addOptionalSign: boolean; fieldName: string; replaceWithType: string }[]
  ): string {
    this._globalDeclarations.add(OMIT_TYPE);
    return `Omit<${typeName}, ${relevantFields.map(f => `'${f.fieldName}'`).join(' | ')}> & { ${relevantFields
      .map(f => `${f.fieldName}${f.addOptionalSign ? '?' : ''}: ${f.replaceWithType}`)
      .join(', ')} }`;
  }

  protected applyMaybe(str: string): string {
    const namespacedImportPrefix = this.config.namespacedImportName ? this.config.namespacedImportName + '.' : '';
    return `${namespacedImportPrefix}Maybe<${str}>`;
  }

  protected applyResolverTypeWrapper(str: string): string {
    return `ResolverTypeWrapper<${this.clearResolverTypeWrapper(str)}>`;
  }

  protected clearMaybe(str: string): string {
    const namespacedImportPrefix = this.config.namespacedImportName ? this.config.namespacedImportName + '.' : '';
    if (str.startsWith(`${namespacedImportPrefix}Maybe<`)) {
      const maybeRe = new RegExp(`${namespacedImportPrefix.replace('.', '\\.')}Maybe<(.*?)>$`);
      return str.replace(maybeRe, '$1');
    }

    return str;
  }

  protected clearResolverTypeWrapper(str: string): string {
    if (str.startsWith('ResolverTypeWrapper<')) {
      return str.replace(/ResolverTypeWrapper<(.*?)>$/, '$1');
    }

    return str;
  }

  protected wrapWithArray(t: string): string {
    if (this.config.immutableTypes) {
      return `ReadonlyArray<${t}>`;
    }

    return `Array<${t}>`;
  }

  protected createFieldContextTypeMap(): FieldContextTypeMap {
    return this.config.fieldContextTypes.reduce<FieldContextTypeMap>((prev, fieldContextType) => {
      const items = fieldContextType.split('#');
      if (items.length === 3) {
        const [path, source, contextTypeName] = items;
        return { ...prev, [path]: parseMapper(`${source}#${contextTypeName}`) };
      }
      const [path, contextType] = items;
      return { ...prev, [path]: parseMapper(contextType) };
    }, {});
  }
  protected createDirectivedContextType(): FieldContextTypeMap {
    return this.config.directiveContextTypes.reduce<FieldContextTypeMap>((prev, fieldContextType) => {
      const items = fieldContextType.split('#');
      if (items.length === 3) {
        const [path, source, contextTypeName] = items;
        return { ...prev, [path]: parseMapper(`${source}#${contextTypeName}`) };
      }
      const [path, contextType] = items;
      return { ...prev, [path]: parseMapper(contextType) };
    }, {});
  }

  public buildResolversTypes(): string {
    const declarationKind = 'type';
    return new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind(declarationKind)
      .withName(this.convertName('ResolversTypes'))
      .withComment('Mapping between all available schema types and the resolvers types')
      .withBlock(
        Object.keys(this._resolversTypes)
          .map(typeName =>
            indent(`${typeName}: ${this._resolversTypes[typeName]}${this.getPunctuation(declarationKind)}`)
          )
          .join('\n')
      ).string;
  }

  public buildResolversParentTypes(): string {
    const declarationKind = 'type';
    return new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind(declarationKind)
      .withName(this.convertName('ResolversParentTypes'))
      .withComment('Mapping between all available schema types and the resolvers parents')
      .withBlock(
        Object.keys(this._resolversParentTypes)
          .map(typeName =>
            indent(`${typeName}: ${this._resolversParentTypes[typeName]}${this.getPunctuation(declarationKind)}`)
          )
          .join('\n')
      ).string;
  }

  public get schema(): GraphQLSchema {
    return this._schema;
  }

  public get defaultMapperType(): string {
    return this.config.defaultMapper.type;
  }

  public get unusedMappers() {
    return Object.keys(this.config.mappers).filter(name => !this._usedMappers[name]);
  }

  public get globalDeclarations(): string[] {
    return Array.from(this._globalDeclarations);
  }

  protected isMapperImported(groupedMappers: GroupedMappers, identifier: string, source: string): boolean {
    const exists = !groupedMappers[source] ? false : !!groupedMappers[source].find(m => m.identifier === identifier);
    const existsFromEnums = !!Object.keys(this.config.enumValues)
      .map(key => this.config.enumValues[key])
      .find(o => o.sourceFile === source && o.typeIdentifier === identifier);

    return exists || existsFromEnums;
  }

  public get mappersImports(): string[] {
    const groupedMappers: GroupedMappers = {};

    const addMapper = (source: string, identifier: string, asDefault: boolean) => {
      if (!this.isMapperImported(groupedMappers, identifier, source)) {
        if (!groupedMappers[source]) {
          groupedMappers[source] = [];
        }

        groupedMappers[source].push({ identifier, asDefault });
      }
    };

    Object.keys(this.config.mappers)
      .map(gqlTypeName => ({ gqlType: gqlTypeName, mapper: this.config.mappers[gqlTypeName] }))
      .filter(({ mapper }) => mapper.isExternal)
      .forEach(({ mapper }) => {
        const externalMapper = mapper as ExternalParsedMapper;
        const identifier = stripMapperTypeInterpolation(externalMapper.import);
        addMapper(externalMapper.source, identifier, externalMapper.default);
      });

    if (this.config.contextType.isExternal) {
      addMapper(this.config.contextType.source, this.config.contextType.import, this.config.contextType.default);
    }

    if (this.config.rootValueType.isExternal) {
      addMapper(this.config.rootValueType.source, this.config.rootValueType.import, this.config.rootValueType.default);
    }

    if (this.config.defaultMapper && this.config.defaultMapper.isExternal) {
      const identifier = stripMapperTypeInterpolation(this.config.defaultMapper.import);
      addMapper(this.config.defaultMapper.source, identifier, this.config.defaultMapper.default);
    }

    Object.values(this._fieldContextTypeMap).forEach(parsedMapper => {
      if (parsedMapper.isExternal) {
        addMapper(parsedMapper.source, parsedMapper.import, parsedMapper.default);
      }
    });

    Object.values(this._directiveContextTypesMap).forEach(parsedMapper => {
      if (parsedMapper.isExternal) {
        addMapper(parsedMapper.source, parsedMapper.import, parsedMapper.default);
      }
    });

    return Object.keys(groupedMappers)
      .map(source => buildMapperImport(source, groupedMappers[source], this.config.useTypeImports))
      .filter(Boolean);
  }

  setDeclarationBlockConfig(config: DeclarationBlockConfig): void {
    this._declarationBlockConfig = config;
  }

  setVariablesTransformer(variablesTransfomer: OperationVariablesToObject): void {
    this._variablesTransformer = variablesTransfomer;
  }

  public hasScalars(): boolean {
    return this._hasScalars;
  }

  public hasFederation(): boolean {
    return this._hasFederation;
  }

  public getRootResolver(): string {
    const name = this.convertName(this.config.allResolversTypeName);
    const declarationKind = 'type';
    const contextType = `<ContextType = ${this.config.contextType.type}>`;

    return [
      new DeclarationBlock(this._declarationBlockConfig)
        .export()
        .asKind(declarationKind)
        .withName(name, contextType)
        .withBlock(
          Object.keys(this._collectedResolvers)
            .map(schemaTypeName => {
              const resolverType = this._collectedResolvers[schemaTypeName];

              return indent(this.formatRootResolver(schemaTypeName, resolverType, declarationKind));
            })
            .join('\n')
        ).string,
    ].join('\n');
  }

  protected formatRootResolver(schemaTypeName: string, resolverType: string, declarationKind: DeclarationKind): string {
    return `${schemaTypeName}${this.config.avoidOptionals ? '' : '?'}: ${resolverType}${this.getPunctuation(
      declarationKind
    )}`;
  }

  public getAllDirectiveResolvers(): string {
    if (Object.keys(this._collectedDirectiveResolvers).length) {
      const declarationKind = 'type';
      const name = this.convertName('DirectiveResolvers');
      const contextType = `<ContextType = ${this.config.contextType.type}>`;

      return [
        new DeclarationBlock(this._declarationBlockConfig)
          .export()
          .asKind(declarationKind)
          .withName(name, contextType)
          .withBlock(
            Object.keys(this._collectedDirectiveResolvers)
              .map(schemaTypeName => {
                const resolverType = this._collectedDirectiveResolvers[schemaTypeName];

                return indent(this.formatRootResolver(schemaTypeName, resolverType, declarationKind));
              })
              .join('\n')
          ).string,
      ].join('\n');
    }

    return '';
  }

  Name(node: NameNode): string {
    return node.value;
  }

  ListType(node: ListTypeNode): string {
    const asString = node.type as any as string;

    return this.wrapWithArray(asString);
  }

  protected _getScalar(name: string): string {
    return `${this.config.namespacedImportName ? this.config.namespacedImportName + '.' : ''}Scalars['${name}']`;
  }

  NamedType(node: NamedTypeNode): string {
    const nameStr = node.name as any as string;

    if (this.config.scalars[nameStr]) {
      return this._getScalar(nameStr);
    }

    return this.convertName(node, null, true);
  }

  NonNullType(node: NonNullTypeNode): string {
    const asString = node.type as any as string;

    return asString;
  }

  protected markMapperAsUsed(name: string): void {
    this._usedMappers[name] = true;
  }

  protected getTypeToUse(name: string): string {
    const resolversType = this.convertName('ResolversTypes');

    return `${resolversType}['${name}']`;
  }

  protected getParentTypeToUse(name: string): string {
    const resolversType = this.convertName('ResolversParentTypes');

    return `${resolversType}['${name}']`;
  }

  protected getParentTypeForSignature(_node: FieldDefinitionNode): string {
    return 'ParentType';
  }

  protected transformParentGenericType(parentType: string): string {
    return `ParentType extends ${parentType} = ${parentType}`;
  }

  FieldDefinition(node: FieldDefinitionNode, key: string | number, parent: any): (parentName: string) => string | null {
    const hasArguments = node.arguments && node.arguments.length > 0;
    const declarationKind = 'type';

    return (parentName: string) => {
      const original: FieldDefinitionNode = parent[key];
      const baseType = getBaseTypeNode(original.type);
      const realType = baseType.name.value;
      const parentType = this.schema.getType(parentName);

      if (this._federation.skipField({ fieldNode: original, parentType })) {
        return null;
      }

      const contextType = this.getContextType(parentName, node);

      const typeToUse = this.getTypeToUse(realType);
      const mappedType = this._variablesTransformer.wrapAstTypeWithModifiers(typeToUse, original.type);
      const subscriptionType = this._schema.getSubscriptionType();
      const isSubscriptionType = subscriptionType && subscriptionType.name === parentName;

      let argsType = hasArguments
        ? this.convertName(
            parentName +
              (this.config.addUnderscoreToArgsType ? '_' : '') +
              this.convertName(node.name, {
                useTypesPrefix: false,
                useTypesSuffix: false,
              }) +
              'Args',
            {
              useTypesPrefix: true,
            },
            true
          )
        : null;

      if (argsType !== null) {
        const argsToForceRequire = original.arguments.filter(
          arg => !!arg.defaultValue || arg.type.kind === 'NonNullType'
        );

        if (argsToForceRequire.length > 0) {
          argsType = this.applyRequireFields(argsType, argsToForceRequire);
        } else if (original.arguments.length > 0) {
          argsType = this.applyOptionalFields(argsType, original.arguments);
        }
      }

      const parentTypeSignature = this._federation.transformParentType({
        fieldNode: original,
        parentType,
        parentTypeSignature: this.getParentTypeForSignature(node),
      });
      const mappedTypeKey = isSubscriptionType ? `${mappedType}, "${node.name}"` : mappedType;

      const directiveMappings =
        node.directives
          ?.map(directive => this._directiveResolverMappings[directive.name as any])
          .filter(Boolean)
          .reverse() ?? [];

      const resolverType = isSubscriptionType ? 'SubscriptionResolver' : directiveMappings[0] ?? 'Resolver';

      const avoidOptionals = this.config.avoidOptionals?.resolvers ?? this.config.avoidOptionals === true;
      const signature: {
        name: string;
        modifier: string;
        type: string;
        genericTypes: string[];
      } = {
        name: node.name as any,
        modifier: avoidOptionals ? '' : '?',
        type: resolverType,
        genericTypes: [mappedTypeKey, parentTypeSignature, contextType, argsType].filter(f => f),
      };

      if (this._federation.isResolveReferenceField(node)) {
        this._hasFederation = true;
        signature.type = 'ReferenceResolver';

        if (signature.genericTypes.length >= 3) {
          signature.genericTypes = signature.genericTypes.slice(0, 3);
        }
      }

      return indent(
        `${signature.name}${signature.modifier}: ${signature.type}<${signature.genericTypes.join(
          ', '
        )}>${this.getPunctuation(declarationKind)}`
      );
    };
  }

  private getFieldContextType(parentName: string, node: FieldDefinitionNode): string {
    if (this._fieldContextTypeMap[`${parentName}.${node.name}`]) {
      return this._fieldContextTypeMap[`${parentName}.${node.name}`].type;
    }
    return 'ContextType';
  }

  private getContextType(parentName: string, node: FieldDefinitionNode): string {
    let contextType = this.getFieldContextType(parentName, node);

    for (const directive of node.directives) {
      const name = directive.name as unknown as string;
      const directiveMap = this._directiveContextTypesMap[name];
      if (directiveMap) {
        contextType = `${directiveMap.type}<${contextType}>`;
      }
    }
    return contextType;
  }

  protected applyRequireFields(argsType: string, fields: InputValueDefinitionNode[]): string {
    this._globalDeclarations.add(REQUIRE_FIELDS_TYPE);
    return `RequireFields<${argsType}, ${fields.map(f => `'${f.name.value}'`).join(' | ')}>`;
  }

  protected applyOptionalFields(argsType: string, _fields: readonly InputValueDefinitionNode[]): string {
    return `Partial<${argsType}>`;
  }

  ObjectTypeDefinition(node: ObjectTypeDefinitionNode): string {
    const declarationKind = 'type';
    const name = this.convertName(node, {
      suffix: this.config.resolverTypeSuffix,
    });
    const typeName = node.name as any as string;
    const parentType = this.getParentTypeToUse(typeName);
    const isRootType = [
      this.schema.getQueryType()?.name,
      this.schema.getMutationType()?.name,
      this.schema.getSubscriptionType()?.name,
    ].includes(typeName);

    const fieldsContent = node.fields.map((f: any) => f(node.name));

    if (!isRootType) {
      fieldsContent.push(
        indent(
          `${
            this.config.internalResolversPrefix
          }isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>${this.getPunctuation(declarationKind)}`
        )
      );
    }

    const block = new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind(declarationKind)
      .withName(name, `<ContextType = ${this.config.contextType.type}, ${this.transformParentGenericType(parentType)}>`)
      .withBlock(fieldsContent.join('\n'));

    this._collectedResolvers[node.name as any] = name + '<ContextType>';

    return block.string;
  }

  UnionTypeDefinition(node: UnionTypeDefinitionNode, key: string | number, parent: any): string {
    const declarationKind = 'type';
    const name = this.convertName(node, {
      suffix: this.config.resolverTypeSuffix,
    });
    const originalNode = parent[key] as UnionTypeDefinitionNode;
    const possibleTypes = originalNode.types
      .map(node => node.name.value)
      .map(f => `'${f}'`)
      .join(' | ');

    this._collectedResolvers[node.name as any] = name + '<ContextType>';
    const parentType = this.getParentTypeToUse(node.name as any as string);

    return new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind(declarationKind)
      .withName(name, `<ContextType = ${this.config.contextType.type}, ${this.transformParentGenericType(parentType)}>`)
      .withBlock(
        indent(
          `${this.config.internalResolversPrefix}resolveType${
            this.config.optionalResolveType ? '?' : ''
          }: TypeResolveFn<${possibleTypes}, ParentType, ContextType>${this.getPunctuation(declarationKind)}`
        )
      ).string;
  }

  ScalarTypeDefinition(node: ScalarTypeDefinitionNode): string {
    const nameAsString = node.name as any as string;
    const baseName = this.getTypeToUse(nameAsString);

    if (this._federation.skipScalar(nameAsString)) {
      return null;
    }

    this._hasScalars = true;
    this._collectedResolvers[node.name as any] = 'GraphQLScalarType';

    return new DeclarationBlock({
      ...this._declarationBlockConfig,
      blockTransformer(block) {
        return block;
      },
    })
      .export()
      .asKind('interface')
      .withName(
        this.convertName(node, {
          suffix: 'ScalarConfig',
        }),
        ` extends GraphQLScalarTypeConfig<${baseName}, any>`
      )
      .withBlock(indent(`name: '${node.name}'${this.getPunctuation('interface')}`)).string;
  }

  DirectiveDefinition(node: DirectiveDefinitionNode, key: string | number, parent: any): string {
    if (this._federation.skipDirective(node.name as any)) {
      return null;
    }

    const directiveName = this.convertName(node, {
      suffix: 'DirectiveResolver',
    });
    const sourceNode = parent[key] as DirectiveDefinitionNode;
    const hasArguments = sourceNode.arguments && sourceNode.arguments.length > 0;

    this._collectedDirectiveResolvers[node.name as any] = directiveName + '<any, any, ContextType>';

    const directiveArgsTypeName = this.convertName(node, {
      suffix: 'DirectiveArgs',
    });

    return [
      new DeclarationBlock({
        ...this._declarationBlockConfig,
        blockTransformer(block) {
          return block;
        },
      })
        .export()
        .asKind('type')
        .withName(directiveArgsTypeName)
        .withContent(
          hasArguments
            ? `{\n${this._variablesTransformer.transform<InputValueDefinitionNode>(sourceNode.arguments)}\n}`
            : '{ }'
        ).string,
      new DeclarationBlock({
        ...this._declarationBlockConfig,
        blockTransformer(block) {
          return block;
        },
      })
        .export()
        .asKind('type')
        .withName(
          directiveName,
          `<Result, Parent, ContextType = ${this.config.contextType.type}, Args = ${directiveArgsTypeName}>`
        )
        .withContent(`DirectiveResolverFn<Result, Parent, ContextType, Args>`).string,
    ].join('\n');
  }

  protected buildEnumResolverContentBlock(_node: EnumTypeDefinitionNode, _mappedEnumType: string): string {
    throw new Error(`buildEnumResolverContentBlock is not implemented!`);
  }

  protected buildEnumResolversExplicitMappedValues(
    _node: EnumTypeDefinitionNode,
    _valuesMapping: { [valueName: string]: string | number }
  ): string {
    throw new Error(`buildEnumResolversExplicitMappedValues is not implemented!`);
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): string {
    const rawTypeName = node.name as any;

    // If we have enumValues set, and it's point to an external enum - we need to allow internal values resolvers
    // In case we have enumValues set but as explicit values, no need to to do mapping since it's already
    // have type validation (the original enum has been modified by base types plugin).
    // If we have mapper for that type - we can skip
    if (!this.config.mappers[rawTypeName] && !this.config.enumValues[rawTypeName]) {
      return null;
    }

    const name = this.convertName(node, { suffix: this.config.resolverTypeSuffix });
    this._collectedResolvers[rawTypeName] = name;
    const hasExplicitValues = this.config.enumValues[rawTypeName] && this.config.enumValues[rawTypeName].mappedValues;

    return new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind('type')
      .withName(name)
      .withContent(
        hasExplicitValues
          ? this.buildEnumResolversExplicitMappedValues(node, this.config.enumValues[rawTypeName].mappedValues)
          : this.buildEnumResolverContentBlock(node, this.getTypeToUse(rawTypeName))
      ).string;
  }

  InterfaceTypeDefinition(node: InterfaceTypeDefinitionNode): string {
    const name = this.convertName(node, {
      suffix: this.config.resolverTypeSuffix,
    });
    const declarationKind = 'type';
    const allTypesMap = this._schema.getTypeMap();
    const implementingTypes: string[] = [];

    this._collectedResolvers[node.name as any] = name + '<ContextType>';

    for (const graphqlType of Object.values(allTypesMap)) {
      if (graphqlType instanceof GraphQLObjectType) {
        const allInterfaces = graphqlType.getInterfaces();
        if (allInterfaces.find(int => int.name === (node.name as any as string))) {
          implementingTypes.push(graphqlType.name);
        }
      }
    }

    const parentType = this.getParentTypeToUse(node.name as any as string);
    const possibleTypes = implementingTypes.map(name => `'${name}'`).join(' | ') || 'null';
    const fields = this.config.onlyResolveTypeForInterfaces ? [] : node.fields || [];

    return new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind(declarationKind)
      .withName(name, `<ContextType = ${this.config.contextType.type}, ${this.transformParentGenericType(parentType)}>`)
      .withBlock(
        [
          indent(
            `${this.config.internalResolversPrefix}resolveType${
              this.config.optionalResolveType ? '?' : ''
            }: TypeResolveFn<${possibleTypes}, ParentType, ContextType>${this.getPunctuation(declarationKind)}`
          ),
          ...fields.map((f: any) => f(node.name)),
        ].join('\n')
      ).string;
  }

  SchemaDefinition() {
    return null;
  }
}

function replacePlaceholder(pattern: string, typename: string): string {
  return pattern.replace(/\{T\}/g, typename);
}

function hasPlaceholder(pattern: string): boolean {
  return pattern.includes('{T}');
}
