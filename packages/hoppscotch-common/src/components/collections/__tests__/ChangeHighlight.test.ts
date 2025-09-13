import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import ChangeHighlight from "../ChangeHighlight.vue"
import type { SpecDiff } from "../../../types/spec-diff"

// Mock icon component
const IconStub = {
  name: "Icon",
  template: '<span class="icon" :data-name="name"></span>',
  props: ["name"],
}

describe("ChangeHighlight", () => {
  const mockChanges: SpecDiff = {
    hasChanges: true,
    endpoints: [
      {
        path: "/users",
        method: "GET",
        type: "added",
        isBreaking: false,
        summary: "New endpoint added",
      },
      {
        path: "/users/{id}",
        method: "PUT",
        type: "modified",
        isBreaking: false,
        summary: "Endpoint modified",
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
    return mount(ChangeHighlight, {
      props: {
        changes: mockChanges,
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
    it("should render change indicator with correct class", () => {
      const wrapper = createWrapper()

      expect(wrapper.find(".change-highlight").exists()).toBe(true)
      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-breaking"
      )
    })

    it("should show correct change icon for breaking changes", () => {
      const wrapper = createWrapper()

      const icon = wrapper.find(".change-icon")
      expect(icon.attributes("data-name")).toBe("alert-triangle")
    })

    it("should show correct change label", () => {
      const wrapper = createWrapper()

      expect(wrapper.find(".change-label").text()).toBe("Breaking changes")
    })

    it("should show change count for non-breaking changes", () => {
      const nonBreakingChanges: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "added",
            isBreaking: false,
            summary: "New endpoint added",
          },
          {
            path: "/posts",
            method: "POST",
            type: "added",
            isBreaking: false,
            summary: "Another endpoint added",
          },
        ],
        summary: "API updated with 2 changes",
      }

      const wrapper = createWrapper({ changes: nonBreakingChanges })

      expect(wrapper.find(".change-label").text()).toBe("2 changes")
      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-added"
      )
    })

    it('should show "Up to date" for no changes', () => {
      const noChanges: SpecDiff = {
        hasChanges: false,
        endpoints: [],
        summary: "No changes",
      }

      const wrapper = createWrapper({ changes: noChanges })

      expect(wrapper.find(".change-label").text()).toBe("Up to date")
      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-none"
      )
    })

    it("should hide label when showLabel is false", () => {
      const wrapper = createWrapper({ showLabel: false })

      expect(wrapper.find(".change-label").exists()).toBe(false)
    })
  })

  describe("change details", () => {
    it("should show details when showDetails is true", () => {
      const wrapper = createWrapper({ showDetails: true })

      expect(wrapper.find(".change-details").exists()).toBe(true)
      expect(wrapper.find(".change-summary").exists()).toBe(true)
      expect(wrapper.find(".endpoint-changes").exists()).toBe(true)
    })

    it("should hide details when showDetails is false", () => {
      const wrapper = createWrapper({ showDetails: false })

      expect(wrapper.find(".change-details").exists()).toBe(false)
    })

    it("should render endpoint changes correctly", () => {
      const wrapper = createWrapper({ showDetails: true })

      const endpointChanges = wrapper.findAll(".endpoint-change")
      expect(endpointChanges).toHaveLength(3)

      // Check first endpoint (added)
      const firstChange = endpointChanges[0]
      expect(firstChange.classes()).toContain("change-added")
      expect(firstChange.find(".method-badge").text()).toBe("GET")
      expect(firstChange.find(".endpoint-path").text()).toBe("/users")
      expect(firstChange.find(".change-type").text()).toContain("Added")

      // Check breaking change
      const breakingChange = endpointChanges[2]
      expect(breakingChange.classes()).toContain("breaking")
      expect(breakingChange.find(".breaking-badge").exists()).toBe(true)
    })

    it("should show correct method badge classes", () => {
      const wrapper = createWrapper({ showDetails: true })

      const methodBadges = wrapper.findAll(".method-badge")
      expect(methodBadges[0].classes()).toContain("get")
      expect(methodBadges[1].classes()).toContain("put")
      expect(methodBadges[2].classes()).toContain("delete")
    })
  })

  describe("actions", () => {
    it("should show undo button when canUndo is true", () => {
      const wrapper = createWrapper({ showDetails: true, canUndo: true })

      const undoButton = wrapper.find('button[data-action="undo"]')
      expect(undoButton.exists()).toBe(true)
    })

    it("should hide undo button when canUndo is false", () => {
      const wrapper = createWrapper({ showDetails: true, canUndo: false })

      const undoButton = wrapper.find('button[data-action="undo"]')
      expect(undoButton.exists()).toBe(false)
    })

    it("should emit undo event when undo button is clicked", async () => {
      const wrapper = createWrapper({ showDetails: true, canUndo: true })

      await wrapper.find("button").trigger("click")

      expect(wrapper.emitted("undo")).toBeTruthy()
    })

    it("should emit view-diff event when view diff button is clicked", async () => {
      const wrapper = createWrapper({ showDetails: true })

      const viewDiffButton = wrapper
        .findAll("button")
        .find((btn) => btn.text().includes("View Full Diff"))

      await viewDiffButton!.trigger("click")

      expect(wrapper.emitted("view-diff")).toBeTruthy()
    })

    it("should emit dismiss event when dismiss button is clicked", async () => {
      const wrapper = createWrapper({ showDetails: true })

      const dismissButton = wrapper
        .findAll("button")
        .find((btn) => btn.text().includes("Dismiss"))

      await dismissButton!.trigger("click")

      expect(wrapper.emitted("dismiss")).toBeTruthy()
    })
  })

  describe("computed properties", () => {
    it("should calculate correct tooltip text", () => {
      const wrapper = createWrapper()

      const indicator = wrapper.find(".change-indicator")
      const tooltip = indicator.attributes("title")

      expect(tooltip).toContain("1 added")
      expect(tooltip).toContain("1 modified")
      expect(tooltip).toContain("1 removed")
      expect(tooltip).toContain("1 breaking")
    })

    it("should show correct change summary for breaking changes", () => {
      const wrapper = createWrapper({ showDetails: true })

      const summary = wrapper.find(".change-summary h4")
      expect(summary.text()).toBe("Breaking Changes Detected (3 endpoints)")
    })

    it("should show correct change description for breaking changes", () => {
      const wrapper = createWrapper({ showDetails: true })

      const description = wrapper.find(".change-description")
      expect(description.text()).toContain("may break existing requests")
    })
  })

  describe("change type detection", () => {
    it("should prioritize breaking changes", () => {
      const wrapper = createWrapper()

      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-breaking"
      )
      expect(wrapper.find(".change-icon").attributes("data-name")).toBe(
        "alert-triangle"
      )
    })

    it("should show removed changes when no breaking changes", () => {
      const removedChanges: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "DELETE",
            type: "removed",
            isBreaking: false,
            summary: "Endpoint removed",
          },
        ],
        summary: "API updated",
      }

      const wrapper = createWrapper({ changes: removedChanges })

      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-removed"
      )
      expect(wrapper.find(".change-icon").attributes("data-name")).toBe(
        "minus-circle"
      )
    })

    it("should show modified changes when no breaking or removed changes", () => {
      const modifiedChanges: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "PUT",
            type: "modified",
            isBreaking: false,
            summary: "Endpoint modified",
          },
        ],
        summary: "API updated",
      }

      const wrapper = createWrapper({ changes: modifiedChanges })

      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-modified"
      )
      expect(wrapper.find(".change-icon").attributes("data-name")).toBe("edit")
    })

    it("should show added changes when only additions", () => {
      const addedChanges: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "POST",
            type: "added",
            isBreaking: false,
            summary: "Endpoint added",
          },
        ],
        summary: "API updated",
      }

      const wrapper = createWrapper({ changes: addedChanges })

      expect(wrapper.find(".change-highlight").classes()).toContain(
        "change-added"
      )
      expect(wrapper.find(".change-icon").attributes("data-name")).toBe(
        "plus-circle"
      )
    })
  })
})
