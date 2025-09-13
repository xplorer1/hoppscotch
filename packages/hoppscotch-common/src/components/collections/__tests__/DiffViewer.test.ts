import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import DiffViewer from "../DiffViewer.vue"
import type { SpecDiff } from "../../../types/spec-diff"

// Mock icon component
const IconStub = {
  name: "Icon",
  template: '<span class="icon" :data-name="name"></span>',
  props: ["name"],
}

describe("DiffViewer", () => {
  const mockDiff: SpecDiff = {
    hasChanges: true,
    endpoints: [
      {
        path: "/users",
        method: "GET",
        type: "added",
        isBreaking: false,
        summary: "New endpoint added",
        newEndpoint: {
          summary: "Get all users",
          description: "Retrieve a list of all users",
          parameters: [
            { name: "limit", type: "integer", required: false },
            { name: "offset", type: "integer", required: false },
          ],
        },
      },
      {
        path: "/users/{id}",
        method: "PUT",
        type: "modified",
        isBreaking: false,
        summary: "Endpoint modified",
        details: [
          {
            field: "requestBody.schema.properties.email",
            oldValue: { type: "string" },
            newValue: { type: "string", format: "email" },
            isBreaking: false,
          },
        ],
      },
      {
        path: "/admin",
        method: "DELETE",
        type: "removed",
        isBreaking: true,
        summary: "Breaking endpoint removed",
      },
    ],
    summary: "API updated with 3 changes",
  }

  const createWrapper = (props = {}) => {
    return mount(DiffViewer, {
      props: {
        diff: mockDiff,
        sourceName: "Test API",
        ...props,
      },
      global: {
        stubs: {
          icon: IconStub,
        },
      },
    })
  }

  describe("rendering", () => {
    it("should render diff viewer with header", () => {
      const wrapper = createWrapper()

      expect(wrapper.find(".diff-viewer").exists()).toBe(true)
      expect(wrapper.find(".diff-title h3").text()).toBe("API Changes")
      expect(wrapper.find(".diff-subtitle").text()).toContain("Test API")
    })

    it("should display correct statistics", () => {
      const wrapper = createWrapper()

      const stats = wrapper.findAll(".stat")
      expect(stats).toHaveLength(4) // added, modified, removed, breaking

      expect(stats[0].text()).toContain("1 Added")
      expect(stats[1].text()).toContain("1 Modified")
      expect(stats[2].text()).toContain("1 Removed")
      expect(stats[3].text()).toContain("1 Breaking")
    })

    it("should not show breaking stat when no breaking changes", () => {
      const nonBreakingDiff: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "added",
            isBreaking: false,
            summary: "New endpoint added",
          },
        ],
        summary: "API updated",
      }

      const wrapper = createWrapper({ diff: nonBreakingDiff })

      const stats = wrapper.findAll(".stat")
      expect(stats).toHaveLength(3) // only added, modified, removed
      expect(wrapper.find(".stat-breaking").exists()).toBe(false)
    })
  })

  describe("filtering", () => {
    it("should show all filter checkboxes", () => {
      const wrapper = createWrapper()

      const checkboxes = wrapper.findAll(".filter-checkbox input")
      expect(checkboxes).toHaveLength(4) // added, modified, removed, breaking only

      // All should be checked by default except breaking only
      expect(checkboxes[0].element.checked).toBe(true) // added
      expect(checkboxes[1].element.checked).toBe(true) // modified
      expect(checkboxes[2].element.checked).toBe(true) // removed
      expect(checkboxes[3].element.checked).toBe(false) // breaking only
    })

    it("should filter changes based on type selection", async () => {
      const wrapper = createWrapper()

      // Initially should show all 3 changes
      expect(wrapper.findAll(".diff-item")).toHaveLength(3)

      // Uncheck "added"
      const addedCheckbox = wrapper.findAll(".filter-checkbox input")[0]
      await addedCheckbox.setValue(false)

      // Should now show only 2 changes (modified and removed)
      expect(wrapper.findAll(".diff-item")).toHaveLength(2)
    })

    it("should filter to show only breaking changes", async () => {
      const wrapper = createWrapper()

      // Check "breaking only"
      const breakingOnlyCheckbox = wrapper.findAll(".filter-checkbox input")[3]
      await breakingOnlyCheckbox.setValue(true)

      // Should show only 1 breaking change
      expect(wrapper.findAll(".diff-item")).toHaveLength(1)
      expect(wrapper.find(".diff-item").classes()).toContain("breaking")
    })
  })

  describe("diff items", () => {
    it("should render diff items with correct classes", () => {
      const wrapper = createWrapper()

      const items = wrapper.findAll(".diff-item")
      expect(items).toHaveLength(3)

      expect(items[0].classes()).toContain("diff-added")
      expect(items[1].classes()).toContain("diff-modified")
      expect(items[2].classes()).toContain("diff-removed")
      expect(items[2].classes()).toContain("breaking")
    })

    it("should show correct method badges and paths", () => {
      const wrapper = createWrapper()

      const items = wrapper.findAll(".diff-item")

      // First item (GET /users)
      expect(items[0].find(".method-badge").text()).toBe("GET")
      expect(items[0].find(".method-badge").classes()).toContain("get")
      expect(items[0].find(".endpoint-path").text()).toBe("/users")

      // Second item (PUT /users/{id})
      expect(items[1].find(".method-badge").text()).toBe("PUT")
      expect(items[1].find(".method-badge").classes()).toContain("put")
      expect(items[1].find(".endpoint-path").text()).toBe("/users/{id}")
    })

    it("should show change badges correctly", () => {
      const wrapper = createWrapper()

      const items = wrapper.findAll(".diff-item")

      expect(items[0].find(".change-badge").text()).toBe("Added")
      expect(items[0].find(".change-badge").classes()).toContain("added")

      expect(items[1].find(".change-badge").text()).toBe("Modified")
      expect(items[1].find(".change-badge").classes()).toContain("modified")

      expect(items[2].find(".change-badge").text()).toBe("Removed")
      expect(items[2].find(".change-badge").classes()).toContain("removed")

      // Breaking badge should only appear on breaking changes
      expect(items[2].find(".breaking-badge").exists()).toBe(true)
      expect(items[0].find(".breaking-badge").exists()).toBe(false)
    })
  })

  describe("expansion", () => {
    it("should expand item when header is clicked", async () => {
      const wrapper = createWrapper()

      const firstItem = wrapper.findAll(".diff-item")[0]

      // Initially collapsed
      expect(firstItem.find(".diff-item-content").exists()).toBe(false)
      expect(
        firstItem.find(".expand-toggle .icon").attributes("data-name")
      ).toBe("chevron-right")

      // Click to expand
      await firstItem.find(".diff-item-header").trigger("click")

      // Should be expanded
      expect(firstItem.find(".diff-item-content").exists()).toBe(true)
      expect(
        firstItem.find(".expand-toggle .icon").attributes("data-name")
      ).toBe("chevron-down")
    })

    it("should show endpoint preview for added endpoints", async () => {
      const wrapper = createWrapper()

      const addedItem = wrapper.findAll(".diff-item")[0]
      await addedItem.find(".diff-item-header").trigger("click")

      const preview = addedItem.find(".endpoint-preview")
      expect(preview.exists()).toBe(true)
      expect(preview.find(".endpoint-summary").text()).toBe("Get all users")
      expect(preview.find(".endpoint-description").text()).toBe(
        "Retrieve a list of all users"
      )

      const parameters = preview.findAll(".endpoint-parameters li")
      expect(parameters).toHaveLength(2)
      expect(parameters[0].text()).toContain("limit")
      expect(parameters[0].text()).toContain("(integer)")
      expect(parameters[0].find(".required").exists()).toBe(false)
    })

    it("should show change details for modified endpoints", async () => {
      const wrapper = createWrapper()

      const modifiedItem = wrapper.findAll(".diff-item")[1]
      await modifiedItem.find(".diff-item-header").trigger("click")

      const details = modifiedItem.find(".change-details")
      expect(details.exists()).toBe(true)

      const changeList = details.findAll(".change-detail")
      expect(changeList).toHaveLength(1)

      const detail = changeList[0]
      expect(detail.find(".detail-field code").text()).toBe(
        "requestBody.schema.properties.email"
      )
      expect(detail.find(".old-value code").text()).toContain("string")
      expect(detail.find(".new-value code").text()).toContain("email")
    })
  })

  describe("actions", () => {
    it("should show correct action buttons", () => {
      const wrapper = createWrapper()

      const actions = wrapper.findAll(".diff-actions .btn")
      expect(actions).toHaveLength(3) // Close, Skip Breaking, Apply Changes

      expect(actions[0].text()).toBe("Close")
      expect(actions[1].text()).toBe("Skip Breaking Changes")
      expect(actions[2].text()).toBe("Apply Changes")
    })

    it("should not show skip breaking button when no breaking changes", () => {
      const nonBreakingDiff: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "added",
            isBreaking: false,
            summary: "New endpoint added",
          },
        ],
        summary: "API updated",
      }

      const wrapper = createWrapper({ diff: nonBreakingDiff })

      const actions = wrapper.findAll(".diff-actions .btn")
      expect(actions).toHaveLength(2) // Only Close and Apply Changes
      expect(wrapper.find(".btn-warning").exists()).toBe(false)
    })

    it("should emit events when action buttons are clicked", async () => {
      const wrapper = createWrapper()

      const actions = wrapper.findAll(".diff-actions .btn")

      // Test close button
      await actions[0].trigger("click")
      expect(wrapper.emitted("close")).toBeTruthy()

      // Test skip breaking button
      await actions[1].trigger("click")
      expect(wrapper.emitted("skip-breaking")).toBeTruthy()

      // Test apply changes button
      await actions[2].trigger("click")
      expect(wrapper.emitted("apply-changes")).toBeTruthy()
    })
  })

  describe("value formatting", () => {
    it("should format object values as JSON", async () => {
      const wrapper = createWrapper()

      const modifiedItem = wrapper.findAll(".diff-item")[1]
      await modifiedItem.find(".diff-item-header").trigger("click")

      const oldValue = modifiedItem.find(".old-value code")
      const newValue = modifiedItem.find(".new-value code")

      // Should contain formatted JSON
      expect(oldValue.text()).toContain('"type": "string"')
      expect(newValue.text()).toContain('"format": "email"')
    })
  })
})
