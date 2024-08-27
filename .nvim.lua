local lspconfig = require("lspconfig")
lspconfig.tsserver.setup({
    init_options = {
        preferences = {
            includeInlayParameterNameHints = 'all',
            includeInlayParameterNameHintsWhenArgumentMatchesName = true,
            includeInlayFunctionParameterTypeHints = true,
            includeInlayVariableTypeHints = true,
            includeInlayPropertyDeclarationTypeHints = true,
            includeInlayFunctionLikeReturnTypeHints = true,
            includeInlayEnumMemberValueHints = true,
            importModuleSpecifierPreference = 'non-relative',
        },
    },
})
lspconfig.cssls.setup({})
lspconfig.eslint.setup({})

local conform = require("conform")
conform.setup({
    formatters_by_ft = {
        typescriptreact = {
            "prettier",
        }
    }
})
